#!/usr/bin/env python3
"""
LLM Analysis Results CSV Cleaner

This script fixes the malformed CSV file that fails at 76% import due to:
1. Unescaped newlines in response_text and summary_text fields
2. Extremely long text fields causing memory issues
3. Improper CSV escaping breaking row structure

The script processes the file in chunks and properly escapes all content.
"""

import csv
import re
import uuid
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('csv_cleanup.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class LLMCSVCleaner:
    """Cleans and validates LLM analysis results CSV file."""

    def __init__(self, input_file: str, output_file: str, chunk_size: int = 10000):
        self.input_file = Path(input_file)
        self.output_file = Path(output_file)
        self.chunk_size = chunk_size

        # Expected columns
        self.expected_columns = [
            'id', 'prompt_id', 'llm_provider', 'website_id', 'is_mentioned',
            'rank_position', 'sentiment_score', 'confidence_score', 'response_text',
            'summary_text', 'analyzed_at', 'created_at', 'analysis_session_id'
        ]

        # Valid LLM providers according to schema
        self.valid_llm_providers = {
            'chatgpt', 'claude', 'gemini', 'perplexity', 'gpt-4', 'claude-3'
        }

        # Statistics
        self.stats = {
            'total_rows': 0,
            'processed_rows': 0,
            'malformed_rows': 0,
            'fixed_rows': 0,
            'skipped_rows': 0,
            'constraint_violations': 0
        }

    def is_valid_uuid(self, value: str) -> bool:
        """Check if string is a valid UUID format."""
        if not value or value.strip() == '':
            return False
        try:
            uuid.UUID(value.strip())
            return True
        except (ValueError, TypeError):
            return False

    def clean_text_field(self, text: str) -> str:
        """Clean and escape text fields for proper CSV format."""
        if not text:
            return ''

        # Remove any null bytes that could cause issues
        text = text.replace('\x00', '')

        # Replace literal newlines with escaped newlines
        text = text.replace('\n', '\\n')
        text = text.replace('\r', '\\r')

        # Escape existing quotes
        text = text.replace('"', '""')

        # Limit extremely long fields to prevent memory issues
        if len(text) > 50000:  # 50KB limit
            text = text[:50000] + "... [TRUNCATED]"
            logger.warning(f"Truncated long text field ({len(text)} chars)")

        return text

    def validate_row(self, row: List[str]) -> Dict[str, Any]:
        """Validate a single row and return validation results."""
        validation = {
            'is_valid': True,
            'errors': [],
            'warnings': []
        }

        # Check column count
        if len(row) != len(self.expected_columns):
            validation['is_valid'] = False
            validation['errors'].append(f"Wrong column count: {len(row)} instead of {len(self.expected_columns)}")
            return validation

        # Create row dict for easier access
        row_dict = dict(zip(self.expected_columns, row))

        # Validate required UUIDs
        required_uuids = ['id', 'prompt_id', 'website_id']
        for field in required_uuids:
            if not self.is_valid_uuid(row_dict[field]):
                validation['is_valid'] = False
                validation['errors'].append(f"Invalid UUID in {field}: {row_dict[field][:50]}")

        # Validate optional UUID
        if row_dict['analysis_session_id'] and not self.is_valid_uuid(row_dict['analysis_session_id']):
            validation['warnings'].append(f"Invalid optional UUID in analysis_session_id: {row_dict['analysis_session_id'][:50]}")
            row_dict['analysis_session_id'] = ''  # Set to empty for NULL

        # Validate LLM provider
        if row_dict['llm_provider'] not in self.valid_llm_providers:
            validation['is_valid'] = False
            validation['errors'].append(f"Invalid LLM provider: {row_dict['llm_provider']}")

        # Validate boolean field
        is_mentioned = row_dict['is_mentioned'].lower().strip()
        if is_mentioned not in ('true', 'false', 't', 'f', '1', '0', ''):
            validation['warnings'].append(f"Invalid boolean value for is_mentioned: {is_mentioned}")

        # Validate numeric constraints
        try:
            if row_dict['rank_position'] and row_dict['rank_position'].strip():
                rank_pos = int(row_dict['rank_position'])
                if rank_pos < -1:
                    validation['errors'].append(f"rank_position must be >= -1, got {rank_pos}")
                    validation['is_valid'] = False
        except ValueError:
            validation['warnings'].append(f"Invalid rank_position: {row_dict['rank_position']}")

        try:
            if row_dict['sentiment_score'] and row_dict['sentiment_score'].strip():
                sentiment = float(row_dict['sentiment_score'])
                if not (-1.0 <= sentiment <= 1.0):
                    validation['errors'].append(f"sentiment_score must be between -1.0 and 1.0, got {sentiment}")
                    validation['is_valid'] = False
        except ValueError:
            validation['warnings'].append(f"Invalid sentiment_score: {row_dict['sentiment_score']}")

        try:
            if row_dict['confidence_score'] and row_dict['confidence_score'].strip():
                confidence = float(row_dict['confidence_score'])
                if not (0.0 <= confidence <= 1.0):
                    validation['errors'].append(f"confidence_score must be between 0.0 and 1.0, got {confidence}")
                    validation['is_valid'] = False
        except ValueError:
            validation['warnings'].append(f"Invalid confidence_score: {row_dict['confidence_score']}")

        return validation

    def fix_malformed_csv_line(self, line: str) -> Optional[List[str]]:
        """Attempt to fix a malformed CSV line by reconstructing proper structure."""
        # This is a complex problem - we'll try to parse what we can
        # and reconstruct based on the expected 13 columns

        # Split on commas, but be aware that content might have commas
        parts = line.split(',')

        if len(parts) < 13:
            return None  # Can't fix if we don't have enough parts

        # Try to reconstruct assuming the first few fields are correct
        # and the text fields (response_text, summary_text) contain the extra commas
        fixed_row = []

        # First 8 fields should be relatively clean
        for i in range(8):
            if i < len(parts):
                fixed_row.append(parts[i].strip())
            else:
                fixed_row.append('')

        # Handle response_text field (index 8) - might span multiple comma-separated parts
        response_start = 8
        summary_start = -1

        # Look for the summary_text start by finding analyzed_at timestamp pattern
        for i in range(response_start + 1, len(parts)):
            # Look for timestamp pattern in the next-to-last fields
            if i < len(parts) - 2:  # Leave room for analyzed_at, created_at, analysis_session_id
                if re.match(r'\d{4}-\d{2}-\d{2}', parts[i]):
                    summary_start = i - 1  # summary_text is before analyzed_at
                    break

        if summary_start == -1:
            # Fallback: assume last 3 fields are analyzed_at, created_at, analysis_session_id
            summary_start = len(parts) - 4

        # Reconstruct response_text
        response_parts = parts[response_start:summary_start]
        fixed_row.append(','.join(response_parts).strip())

        # Add summary_text
        if summary_start < len(parts):
            fixed_row.append(parts[summary_start].strip())
        else:
            fixed_row.append('')

        # Add the last 3 fields
        for i in range(-3, 0):
            if len(parts) + i >= 0:
                fixed_row.append(parts[i].strip())
            else:
                fixed_row.append('')

        return fixed_row[:13]  # Ensure exactly 13 columns

    def process_file(self) -> bool:
        """Process the entire CSV file and create a cleaned version."""
        logger.info(f"Starting CSV cleanup of {self.input_file}")
        logger.info(f"Output will be written to {self.output_file}")

        try:
            with open(self.input_file, 'r', encoding='utf-8', errors='replace') as infile:
                # Read first line to get headers
                header_line = infile.readline().strip()
                headers = [col.strip() for col in header_line.split(',')]

                if headers != self.expected_columns:
                    logger.warning(f"Header mismatch. Expected: {self.expected_columns}")
                    logger.warning(f"Found: {headers}")

                # Open output file
                with open(self.output_file, 'w', encoding='utf-8', newline='') as outfile:
                    writer = csv.writer(outfile, quoting=csv.QUOTE_ALL)

                    # Write header
                    writer.writerow(self.expected_columns)

                    # Process file line by line
                    current_line = ''
                    line_buffer = []

                    for line_num, line in enumerate(infile, start=2):  # Start at 2 since we read header
                        self.stats['total_rows'] = line_num - 1

                        # Progress reporting
                        if line_num % 10000 == 0:
                            logger.info(f"Processed {line_num:,} lines. "
                                      f"Fixed: {self.stats['fixed_rows']:,}, "
                                      f"Skipped: {self.stats['skipped_rows']:,}")

                        line = line.rstrip('\n\r')
                        current_line += line

                        # Try to parse as CSV row
                        try:
                            # Use csv.reader to properly parse the line
                            reader = csv.reader([current_line])
                            row = next(reader)

                            if len(row) == 13:
                                # Valid row structure
                                validation = self.validate_row(row)

                                if validation['is_valid']:
                                    # Clean text fields
                                    row[8] = self.clean_text_field(row[8])  # response_text
                                    row[9] = self.clean_text_field(row[9])  # summary_text

                                    writer.writerow(row)
                                    self.stats['processed_rows'] += 1
                                else:
                                    logger.warning(f"Line {line_num}: Validation errors: {validation['errors']}")
                                    self.stats['constraint_violations'] += 1
                                    # Still write the row but log the issues
                                    row[8] = self.clean_text_field(row[8])
                                    row[9] = self.clean_text_field(row[9])
                                    writer.writerow(row)
                                    self.stats['processed_rows'] += 1

                                current_line = ''  # Reset for next row
                            else:
                                # Malformed row - might be continuation of previous row
                                if len(current_line) > 100000:  # Prevent infinite growth
                                    logger.error(f"Line {line_num}: Row too long, skipping")
                                    self.stats['skipped_rows'] += 1
                                    current_line = ''
                                # Otherwise, continue accumulating the line

                        except csv.Error:
                            # CSV parsing error - try to fix
                            fixed_row = self.fix_malformed_csv_line(current_line)
                            if fixed_row:
                                validation = self.validate_row(fixed_row)
                                if validation['is_valid'] or len(validation['errors']) == 0:
                                    fixed_row[8] = self.clean_text_field(fixed_row[8])
                                    fixed_row[9] = self.clean_text_field(fixed_row[9])
                                    writer.writerow(fixed_row)
                                    self.stats['fixed_rows'] += 1
                                    self.stats['processed_rows'] += 1
                                else:
                                    logger.warning(f"Line {line_num}: Could not fix malformed row")
                                    self.stats['skipped_rows'] += 1
                            else:
                                logger.warning(f"Line {line_num}: Could not parse malformed row")
                                self.stats['skipped_rows'] += 1

                            current_line = ''

                    # Handle any remaining content
                    if current_line.strip():
                        try:
                            reader = csv.reader([current_line])
                            row = next(reader)
                            if len(row) == 13:
                                validation = self.validate_row(row)
                                row[8] = self.clean_text_field(row[8])
                                row[9] = self.clean_text_field(row[9])
                                writer.writerow(row)
                                self.stats['processed_rows'] += 1
                        except:
                            logger.warning("Could not process final line")
                            self.stats['skipped_rows'] += 1

                # Print final statistics
                logger.info("CSV cleanup completed!")
                logger.info(f"Statistics:")
                logger.info(f"  Total rows processed: {self.stats['total_rows']:,}")
                logger.info(f"  Successfully processed: {self.stats['processed_rows']:,}")
                logger.info(f"  Fixed malformed rows: {self.stats['fixed_rows']:,}")
                logger.info(f"  Skipped rows: {self.stats['skipped_rows']:,}")
                logger.info(f"  Constraint violations: {self.stats['constraint_violations']:,}")

                success_rate = (self.stats['processed_rows'] / self.stats['total_rows']) * 100 if self.stats['total_rows'] > 0 else 0
                logger.info(f"  Success rate: {success_rate:.2f}%")

                return True

        except Exception as e:
            logger.error(f"Error processing file: {e}")
            return False


def main():
    """Main function to run the CSV cleaner."""
    if len(sys.argv) != 3:
        print("Usage: python fix_llm_csv.py <input_csv> <output_csv>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    cleaner = LLMCSVCleaner(input_file, output_file)
    success = cleaner.process_file()

    if success:
        print(f"CSV cleanup completed successfully! Output: {output_file}")
        sys.exit(0)
    else:
        print("CSV cleanup failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Create a clean CSV from the malformed data by using a different parsing strategy.
"""

import csv
import re
import sys

def create_clean_csv(input_file, output_file, max_records=None):
    """Create a clean CSV using a robust parsing approach."""

    uuid_pattern = re.compile(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}),')

    print(f"Reading {input_file}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Total lines: {len(lines):,}")

    # Header
    header = ["id", "prompt_id", "llm_provider", "website_id", "is_mentioned", "rank_position", "sentiment_score", "confidence_score", "response_text", "summary_text", "analyzed_at", "created_at", "analysis_session_id"]

    records = []
    current_record_lines = []
    processed = 0

    for i, line in enumerate(lines[1:], 1):  # Skip header
        if i % 50000 == 0:
            print(f"Processed {i:,} lines, found {len(records):,} records")

        if max_records and len(records) >= max_records:
            print(f"Reached max records limit of {max_records}")
            break

        line = line.rstrip('\n\r')

        # Check if this line starts a new record
        if uuid_pattern.match(line):
            # Process previous record
            if current_record_lines:
                record = parse_record_lines(current_record_lines)
                if record and len(record) == 13:
                    records.append(record)
                    processed += 1

            # Start new record
            current_record_lines = [line]
        else:
            # Add to current record
            if current_record_lines:
                current_record_lines.append(line)

    # Process final record
    if current_record_lines:
        record = parse_record_lines(current_record_lines)
        if record and len(record) == 13:
            records.append(record)
            processed += 1

    print(f"Successfully parsed {len(records):,} records")

    # Write clean CSV
    print(f"Writing to {output_file}...")
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(records)

    print(f"Clean CSV created with {len(records):,} records")
    return len(records)

def parse_record_lines(lines):
    """Parse lines into a record with exactly 13 fields."""

    # Join all lines with a space to reform the record
    full_line = ' '.join(lines).strip()

    # Use a more sophisticated approach to split the CSV
    # We know the structure, so we can work backwards from known patterns

    # Patterns for the last few fields
    timestamp_pattern = r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\+\d{2}'
    uuid_pattern = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

    # Try to extract known fields from the end
    # analysis_session_id (UUID or empty) - last field
    # created_at (timestamp) - second to last
    # analyzed_at (timestamp) - third to last

    # Find timestamps in the line
    timestamps = list(re.finditer(timestamp_pattern, full_line))

    if len(timestamps) >= 2:
        # Get the last two timestamps
        analyzed_at_match = timestamps[-2]
        created_at_match = timestamps[-1]

        # Extract the fixed fields from the beginning
        # Split by commas, but only take the first 8 fields which should be clean
        parts = full_line.split(',')

        if len(parts) >= 8:
            # Take first 8 fields
            fixed_fields = parts[:8]

            # Clean them
            id_val = fixed_fields[0].strip()
            prompt_id = fixed_fields[1].strip()
            llm_provider = fixed_fields[2].strip()
            website_id = fixed_fields[3].strip()
            is_mentioned = fixed_fields[4].strip()
            rank_position = fixed_fields[5].strip()
            sentiment_score = fixed_fields[6].strip()
            confidence_score = fixed_fields[7].strip()

            # Extract timestamps and session_id
            analyzed_at_start = analyzed_at_match.start()
            created_at_start = created_at_match.start()
            created_at_end = created_at_match.end()

            # The text between field 8 and analyzed_at contains response_text and summary_text
            middle_part = full_line[full_line.find(confidence_score) + len(confidence_score) + 1:analyzed_at_start].strip(' ,')

            # Split response_text and summary_text
            # Look for the pattern: "text","other text"
            if '","' in middle_part:
                text_parts = middle_part.rsplit('","', 1)
                response_text = text_parts[0].strip('"')
                summary_text = text_parts[1].strip('"')
            else:
                response_text = middle_part.strip('"')
                summary_text = ""

            analyzed_at = analyzed_at_match.group()
            created_at = created_at_match.group()

            # Everything after created_at is analysis_session_id
            remaining_text = full_line[created_at_end:].strip(' ,')
            analysis_session_id = remaining_text if remaining_text else ""

            record = [
                id_val, prompt_id, llm_provider, website_id, is_mentioned,
                rank_position, sentiment_score, confidence_score,
                response_text, summary_text, analyzed_at, created_at, analysis_session_id
            ]

            return record

    return None

if __name__ == "__main__":
    input_file = "supabase/backup/llm_analysis_results_rows.csv"
    output_file = "supabase/backup/llm_analysis_results_clean.csv"

    try:
        # Process all records
        count = create_clean_csv(input_file, output_file)
        print(f"Successfully created clean CSV with {count:,} records")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
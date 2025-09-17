#!/usr/bin/env python3
"""
Fix malformed CSV file with unescaped newlines in text fields.
This script repairs the llm_analysis_results_rows.csv file by properly handling
multi-line text fields and ensuring correct CSV format.
"""

import csv
import re
import sys
from io import StringIO

def fix_csv_file(input_file, output_file):
    """Fix CSV file with unescaped newlines in text fields."""

    print(f"Reading {input_file}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    print(f"File size: {len(content):,} characters")

    # Split into lines but we'll need to reconstruct records
    lines = content.split('\n')
    print(f"Total lines: {len(lines):,}")

    # Expected header with 13 fields
    expected_header = "id,prompt_id,llm_provider,website_id,is_mentioned,rank_position,sentiment_score,confidence_score,response_text,summary_text,analyzed_at,created_at,analysis_session_id"

    # Check if first line is the expected header
    if lines[0].strip() != expected_header:
        print("Warning: Header doesn't match expected format")
        print(f"Expected: {expected_header}")
        print(f"Found: {lines[0]}")

    fixed_records = []
    current_record = ""
    record_count = 0
    field_count = 0

    print("Processing records...")

    # Start with header
    fixed_records.append(lines[0])

    for i, line in enumerate(lines[1:], 1):
        if i % 50000 == 0:
            print(f"Processed {i:,} lines, found {record_count:,} complete records")

        current_record += line

        # Count fields in current accumulated record
        # We need to be careful about commas inside quoted text
        try:
            # Try to parse the current record as CSV
            csv_reader = csv.reader(StringIO(current_record))
            row = next(csv_reader)
            field_count = len(row)

            # If we have exactly 13 fields and the record ends properly, it's complete
            if field_count == 13:
                # Validate that it looks like a proper record
                # Check if first field looks like a UUID
                if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', row[0]):
                    # This looks like a complete, valid record
                    fixed_records.append(current_record)
                    record_count += 1
                    current_record = ""
                    field_count = 0
                    continue
        except:
            # If we can't parse it, continue accumulating
            pass

        # Add newline back (except for the last line which might be incomplete)
        if i < len(lines) - 1:
            current_record += '\n'

    # Handle any remaining record
    if current_record.strip():
        try:
            csv_reader = csv.reader(StringIO(current_record))
            row = next(csv_reader)
            if len(row) == 13:
                fixed_records.append(current_record)
                record_count += 1
        except:
            print(f"Warning: Discarded incomplete final record: {current_record[:100]}...")

    print(f"Fixed {record_count:,} records")

    # Write the fixed CSV
    print(f"Writing to {output_file}...")
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        for record in fixed_records:
            f.write(record.strip() + '\n')

    print("CSV fix completed!")
    return record_count

if __name__ == "__main__":
    input_file = "supabase/backup/llm_analysis_results_rows.csv"
    output_file = "supabase/backup/llm_analysis_results_rows_fixed.csv"

    try:
        record_count = fix_csv_file(input_file, output_file)
        print(f"Successfully fixed CSV file. Found {record_count:,} valid records.")
        print(f"Original file: {input_file}")
        print(f"Fixed file: {output_file}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
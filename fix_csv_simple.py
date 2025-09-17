#!/usr/bin/env python3
"""
Simple CSV fix - reconstruct records by detecting UUID patterns at start of lines.
"""

import re
import sys

def fix_csv_simple(input_file, output_file):
    """Fix CSV by detecting records that start with UUID pattern."""

    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},')

    print(f"Reading {input_file}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Total lines: {len(lines):,}")

    fixed_lines = []
    current_record = ""
    record_count = 0

    # Keep header
    fixed_lines.append(lines[0].strip())

    for i, line in enumerate(lines[1:], 1):
        if i % 50000 == 0:
            print(f"Processed {i:,} lines, found {record_count:,} records")

        line = line.rstrip('\n\r')

        # If this line starts with UUID pattern, it's a new record
        if uuid_pattern.match(line):
            # Save previous record if we have one
            if current_record.strip():
                # Clean up the record - replace internal newlines with spaces
                cleaned_record = re.sub(r'\s+', ' ', current_record.strip())
                fixed_lines.append(cleaned_record)
                record_count += 1

            # Start new record
            current_record = line
        else:
            # Continue accumulating current record
            if current_record:  # Only if we're in a record
                current_record += " " + line

    # Handle final record
    if current_record.strip():
        cleaned_record = re.sub(r'\s+', ' ', current_record.strip())
        fixed_lines.append(cleaned_record)
        record_count += 1

    print(f"Writing {record_count:,} fixed records to {output_file}...")

    with open(output_file, 'w', encoding='utf-8') as f:
        for line in fixed_lines:
            f.write(line + '\n')

    print("Done!")
    return record_count

if __name__ == "__main__":
    input_file = "supabase/backup/llm_analysis_results_rows.csv"
    output_file = "supabase/backup/llm_analysis_results_rows_fixed.csv"

    try:
        count = fix_csv_simple(input_file, output_file)
        print(f"Fixed CSV with {count:,} records")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
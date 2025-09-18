#!/usr/bin/env python3
"""
Final CSV fix - properly escape text fields and handle commas within fields.
"""

import re
import csv
from io import StringIO

def fix_csv_final(input_file, output_file):
    """Fix CSV by properly reconstructing and escaping fields."""

    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},')

    print(f"Reading {input_file}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Total lines: {len(lines):,}")

    records = []
    current_record_lines = []
    record_count = 0

    # Keep header
    header = lines[0].strip()

    for i, line in enumerate(lines[1:], 1):
        if i % 50000 == 0:
            print(f"Processed {i:,} lines, found {record_count:,} records")

        line = line.rstrip('\n\r')

        # If this line starts with UUID pattern, it's a new record
        if uuid_pattern.match(line):
            # Process previous record if we have one
            if current_record_lines:
                record = process_record_lines(current_record_lines)
                if record:
                    records.append(record)
                    record_count += 1

            # Start new record
            current_record_lines = [line]
        else:
            # Continue accumulating current record
            if current_record_lines:  # Only if we're in a record
                current_record_lines.append(line)

    # Handle final record
    if current_record_lines:
        record = process_record_lines(current_record_lines)
        if record:
            records.append(record)
            record_count += 1

    print(f"Writing {record_count:,} records to {output_file}...")

    # Write properly formatted CSV
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)

        # Write header
        header_fields = header.split(',')
        writer.writerow(header_fields)

        # Write records
        for record in records:
            writer.writerow(record)

    print("Done!")
    return record_count

def process_record_lines(lines):
    """Process accumulated lines into a proper CSV record."""

    # Join all lines with spaces
    full_text = ' '.join(lines).strip()

    # Now we need to carefully split this into 13 fields
    # The structure should be: id,prompt_id,llm_provider,website_id,is_mentioned,rank_position,sentiment_score,confidence_score,response_text,summary_text,analyzed_at,created_at,analysis_session_id

    # Split on commas, but we need to be smart about which commas are field separators
    parts = full_text.split(',')

    if len(parts) < 13:
        return None  # Not enough parts

    # First 8 fields should be simple values
    fields = parts[:8]

    # response_text and summary_text can contain commas - find the last 3 fields (analyzed_at, created_at, analysis_session_id)
    # These should match timestamp patterns

    # Find the last occurrence of timestamp-like patterns
    timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}')

    # Look for last 3 fields from the end
    remaining_parts = parts[8:]

    # Find positions of timestamp patterns
    timestamp_positions = []
    for i, part in enumerate(remaining_parts):
        if timestamp_pattern.search(part):
            timestamp_positions.append(i)

    if len(timestamp_positions) >= 2:
        # Use the last two timestamp positions to split
        last_timestamp_pos = timestamp_positions[-1]
        second_last_pos = timestamp_positions[-2]

        # analyzed_at should be at second_last_pos
        # created_at should be at last_timestamp_pos
        # analysis_session_id is everything after

        response_text_parts = remaining_parts[:second_last_pos]
        analyzed_at_parts = remaining_parts[second_last_pos:last_timestamp_pos]
        created_at_parts = remaining_parts[last_timestamp_pos:last_timestamp_pos+1]
        session_id_parts = remaining_parts[last_timestamp_pos+1:]

        # Join the parts
        response_text = ','.join(response_text_parts).strip()

        # Find where summary_text starts in response_text
        # summary_text typically starts after a quote and is at the end
        # Look for pattern: ","text at the end
        quote_split = response_text.rsplit('","', 1)
        if len(quote_split) == 2:
            response_only = quote_split[0].strip('"')
            summary_text = quote_split[1].strip()
        else:
            # Fallback - put everything in response_text
            response_only = response_text.strip('"')
            summary_text = ""

        analyzed_at = ','.join(analyzed_at_parts).strip()
        created_at = ','.join(created_at_parts).strip()
        analysis_session_id = ','.join(session_id_parts).strip()

        # Complete the fields
        fields.extend([response_only, summary_text, analyzed_at, created_at, analysis_session_id])

        return fields[:13]  # Ensure exactly 13 fields

    return None  # Couldn't parse properly

if __name__ == "__main__":
    input_file = "supabase/backup/llm_analysis_results_rows_fixed.csv"
    output_file = "supabase/backup/llm_analysis_results_rows_final.csv"

    try:
        count = fix_csv_final(input_file, output_file)
        print(f"Final CSV with {count:,} properly formatted records")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
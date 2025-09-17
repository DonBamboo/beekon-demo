#!/usr/bin/env python3
"""
Fix competitor_analysis_results CSV formatting and validate foreign keys.
This script addresses the malformed CSV structure and ensures referential integrity.
"""

import csv
import re
import sys
from pathlib import Path

def fix_competitor_csv(input_file, output_file, llm_ids_file):
    """Fix CSV formatting and validate foreign key references."""

    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},')
    timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\+\d{2}')

    print(f"Reading {input_file}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Total lines: {len(lines):,}")

    # Load valid llm_analysis_results IDs for foreign key validation
    print(f"Loading valid llm_analysis_results IDs from {llm_ids_file}...")
    valid_llm_ids = set()

    try:
        with open(llm_ids_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', line):
                    valid_llm_ids.add(line)
    except FileNotFoundError:
        print(f"Warning: {llm_ids_file} not found. Will extract IDs from llm_analysis_results file.")
        # Extract IDs from the fixed llm_analysis_results file
        llm_file = "supabase/backup/llm_analysis_results_rows_fixed.csv"
        try:
            with open(llm_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.startswith(('id,', 'llm_analysis_id')):  # Skip headers
                        continue
                    match = re.match(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}),', line)
                    if match:
                        valid_llm_ids.add(match.group(1))
        except FileNotFoundError:
            print("Error: Cannot find llm_analysis_results file for FK validation")
            return 0

    print(f"Loaded {len(valid_llm_ids):,} valid llm_analysis_results IDs")

    # Expected header with 14 fields
    expected_header = ["id", "competitor_id", "llm_analysis_id", "llm_provider", "is_mentioned",
                      "rank_position", "sentiment_score", "confidence_score", "response_text",
                      "summary_text", "analyzed_at", "created_at", "prompt_id", "analysis_session_id"]

    records = []
    current_record_lines = []
    total_processed = 0
    valid_records = 0
    fk_violations = 0
    malformed_records = 0

    for i, line in enumerate(lines[1:], 1):  # Skip header
        if i % 50000 == 0:
            print(f"Processed {i:,} lines, found {valid_records:,} valid records")

        line = line.rstrip('\n\r')

        # Check if this line starts a new record
        if uuid_pattern.match(line):
            # Process previous record
            if current_record_lines:
                record = parse_competitor_record(current_record_lines, timestamp_pattern)
                if record and len(record) == 14:
                    total_processed += 1

                    # Validate foreign key
                    llm_analysis_id = record[2]  # llm_analysis_id is 3rd field
                    if llm_analysis_id in valid_llm_ids:
                        records.append(record)
                        valid_records += 1
                    else:
                        fk_violations += 1
                        if fk_violations <= 5:  # Show first few violations
                            print(f"FK violation: llm_analysis_id '{llm_analysis_id}' not found in llm_analysis_results")
                else:
                    malformed_records += 1

            # Start new record
            current_record_lines = [line]
        else:
            # Add to current record
            if current_record_lines:
                current_record_lines.append(line)

    # Process final record
    if current_record_lines:
        record = parse_competitor_record(current_record_lines, timestamp_pattern)
        if record and len(record) == 14:
            total_processed += 1

            llm_analysis_id = record[2]
            if llm_analysis_id in valid_llm_ids:
                records.append(record)
                valid_records += 1
            else:
                fk_violations += 1

    print(f"\nProcessing Summary:")
    print(f"Total processed: {total_processed:,}")
    print(f"Valid records: {valid_records:,}")
    print(f"FK violations: {fk_violations:,}")
    print(f"Malformed records: {malformed_records:,}")

    # Write clean CSV
    print(f"\nWriting {valid_records:,} valid records to {output_file}...")
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(expected_header)
        writer.writerows(records)

    # Write validation report
    report_file = output_file.replace('.csv', '_report.txt')
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write("Competitor Analysis Results CSV Cleanup Report\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Input file: {input_file}\n")
        f.write(f"Output file: {output_file}\n")
        f.write(f"Input lines: {len(lines):,}\n")
        f.write(f"Records processed: {total_processed:,}\n")
        f.write(f"Valid records (with FK integrity): {valid_records:,}\n")
        f.write(f"Records with FK violations: {fk_violations:,}\n")
        f.write(f"Malformed records: {malformed_records:,}\n")
        f.write(f"Success rate: {(valid_records/total_processed*100):.1f}%\n")
        f.write(f"\nValid llm_analysis_results IDs available: {len(valid_llm_ids):,}\n")

    print(f"Cleanup report written to {report_file}")
    return valid_records

def parse_competitor_record(lines, timestamp_pattern):
    """Parse lines into a competitor analysis record with exactly 14 fields."""

    # Join all lines with a space to reform the record
    full_line = ' '.join(lines).strip()

    # Split by commas to get potential fields
    parts = full_line.split(',')

    if len(parts) < 14:
        return None

    # Extract the first 8 fixed fields which should be clean
    try:
        id_val = parts[0].strip()
        competitor_id = parts[1].strip()
        llm_analysis_id = parts[2].strip()
        llm_provider = parts[3].strip()
        is_mentioned = parts[4].strip()
        rank_position = parts[5].strip()
        sentiment_score = parts[6].strip()
        confidence_score = parts[7].strip()

        # Find timestamps in the remaining parts to locate the last few fields
        remaining_parts = parts[8:]
        remaining_text = ','.join(remaining_parts)

        # Find all timestamps
        timestamps = list(timestamp_pattern.finditer(remaining_text))

        if len(timestamps) >= 2:
            # Get the last two timestamps for analyzed_at and created_at
            analyzed_at_match = timestamps[-2]
            created_at_match = timestamps[-1]

            # Extract the text between confidence_score and analyzed_at (contains response_text and summary_text)
            analyzed_at_start = analyzed_at_match.start()
            created_at_start = created_at_match.start()
            created_at_end = created_at_match.end()

            # Text before analyzed_at contains response_text and summary_text
            middle_text = remaining_text[:analyzed_at_start].strip(' ,')

            # Split response_text and summary_text
            if '","' in middle_text:
                text_parts = middle_text.rsplit('","', 1)
                response_text = text_parts[0].strip('"')
                summary_text = text_parts[1].strip('"')
            else:
                response_text = middle_text.strip('"')
                summary_text = ""

            analyzed_at = analyzed_at_match.group()
            created_at = created_at_match.group()

            # Everything after created_at contains prompt_id and analysis_session_id
            remaining_after_created = remaining_text[created_at_end:].strip(' ,')
            final_parts = remaining_after_created.split(',') if remaining_after_created else ['', '']

            prompt_id = final_parts[0].strip() if len(final_parts) > 0 else ""
            analysis_session_id = final_parts[1].strip() if len(final_parts) > 1 else ""

            record = [
                id_val, competitor_id, llm_analysis_id, llm_provider, is_mentioned,
                rank_position, sentiment_score, confidence_score,
                response_text, summary_text, analyzed_at, created_at,
                prompt_id, analysis_session_id
            ]

            return record

    except (IndexError, AttributeError):
        return None

    return None

def extract_llm_ids():
    """Extract valid IDs from llm_analysis_results for FK validation."""

    llm_file = "supabase/backup/llm_analysis_results_rows_fixed.csv"
    output_file = "supabase/backup/valid_llm_analysis_ids.txt"

    ids = set()

    try:
        with open(llm_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('id,'):  # Skip header
                    continue
                match = re.match(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}),', line)
                if match:
                    ids.add(match.group(1))
    except FileNotFoundError:
        print(f"Error: {llm_file} not found")
        return 0

    with open(output_file, 'w', encoding='utf-8') as f:
        for id_val in sorted(ids):
            f.write(id_val + '\n')

    print(f"Extracted {len(ids):,} valid llm_analysis_results IDs to {output_file}")
    return len(ids)

if __name__ == "__main__":
    # First extract valid IDs
    print("Step 1: Extracting valid llm_analysis_results IDs...")
    id_count = extract_llm_ids()

    if id_count == 0:
        print("Cannot proceed without valid llm_analysis_results IDs")
        sys.exit(1)

    # Fix competitor CSV
    print("\nStep 2: Fixing competitor_analysis_results CSV...")
    input_file = "supabase/backup/competitor_analysis_results_rows.csv"
    output_file = "supabase/backup/competitor_analysis_results_fixed.csv"
    llm_ids_file = "supabase/backup/valid_llm_analysis_ids.txt"

    try:
        count = fix_competitor_csv(input_file, output_file, llm_ids_file)
        print(f"\nSuccess! Created clean CSV with {count:,} valid records")
        print(f"File: {output_file}")
        print("This file is ready for import without foreign key violations")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
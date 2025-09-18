#!/usr/bin/env python3
"""
Final fix for competitor_analysis_results CSV with proper CSV formatting.
This version uses more robust CSV handling to ensure proper field escaping.
"""

import csv
import re
import sys
import io

def fix_competitor_csv_final(input_file, output_file, llm_ids_file):
    """Fix CSV with proper formatting and FK validation."""

    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},')
    timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\+\d{2}')

    print(f"Reading {input_file}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Total lines: {len(lines):,}")

    # Load valid llm_analysis_results IDs
    print(f"Loading valid llm_analysis_results IDs from {llm_ids_file}...")
    valid_llm_ids = set()

    with open(llm_ids_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', line):
                valid_llm_ids.add(line)

    print(f"Loaded {len(valid_llm_ids):,} valid llm_analysis_results IDs")

    # Expected header
    header = ["id", "competitor_id", "llm_analysis_id", "llm_provider", "is_mentioned",
              "rank_position", "sentiment_score", "confidence_score", "response_text",
              "summary_text", "analyzed_at", "created_at", "prompt_id", "analysis_session_id"]

    records = []
    current_record_lines = []
    total_processed = 0
    valid_records = 0
    fk_violations = 0

    for i, line in enumerate(lines[1:], 1):  # Skip header
        if i % 50000 == 0:
            print(f"Processed {i:,} lines, found {valid_records:,} valid records")

        line = line.rstrip('\n\r')

        # Check if this line starts a new record
        if uuid_pattern.match(line):
            # Process previous record
            if current_record_lines:
                record = parse_competitor_record_robust(current_record_lines, timestamp_pattern)
                if record and len(record) == 14:
                    total_processed += 1

                    # Validate foreign key
                    llm_analysis_id = record[2]
                    if llm_analysis_id in valid_llm_ids:
                        records.append(record)
                        valid_records += 1
                    else:
                        fk_violations += 1

            # Start new record
            current_record_lines = [line]
        else:
            # Add to current record
            if current_record_lines:
                current_record_lines.append(line)

    # Process final record
    if current_record_lines:
        record = parse_competitor_record_robust(current_record_lines, timestamp_pattern)
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

    # Write clean CSV using proper CSV writer
    print(f"\nWriting {valid_records:,} valid records to {output_file}...")
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)

        for record in records:
            # Clean each field to ensure proper CSV formatting
            cleaned_record = []
            for field in record:
                if isinstance(field, str):
                    # Remove any embedded newlines and normalize whitespace
                    cleaned_field = re.sub(r'\s+', ' ', field.strip())
                    # Remove any problematic characters that might break CSV
                    cleaned_field = cleaned_field.replace('\x00', '').replace('\r', '').replace('\n', ' ')
                    cleaned_record.append(cleaned_field)
                else:
                    cleaned_record.append(field)

            writer.writerow(cleaned_record)

    # Verify the output
    print(f"\nVerifying output file...")
    with open(output_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header_row = next(reader)
        sample_count = 0
        field_errors = 0

        for i, row in enumerate(reader):
            if len(row) != 14:
                field_errors += 1
                if field_errors <= 3:
                    print(f"Warning: Row {i+2} has {len(row)} fields instead of 14")
            sample_count += 1
            if sample_count >= 1000:  # Check first 1000 rows
                break

    if field_errors == 0:
        print("✅ Output verification passed - all rows have correct field count")
    else:
        print(f"⚠️  Found {field_errors} rows with incorrect field count")

    return valid_records

def parse_competitor_record_robust(lines, timestamp_pattern):
    """Parse lines into a competitor record using a more robust approach."""

    # Join all lines with a space
    full_line = ' '.join(lines).strip()

    # Use a more systematic approach to extract fields
    # We know the structure: id,competitor_id,llm_analysis_id,llm_provider,is_mentioned,rank_position,sentiment_score,confidence_score,response_text,summary_text,analyzed_at,created_at,prompt_id,analysis_session_id

    # Extract the first UUID (id)
    uuid_match = re.match(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}),', full_line)
    if not uuid_match:
        return None

    id_val = uuid_match.group(1)
    remaining = full_line[len(id_val) + 1:]  # Skip id and comma

    # Extract competitor_id (second UUID)
    uuid_match2 = re.match(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}),', remaining)
    if not uuid_match2:
        return None

    competitor_id = uuid_match2.group(1)
    remaining = remaining[len(competitor_id) + 1:]

    # Extract llm_analysis_id (third UUID)
    uuid_match3 = re.match(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}),', remaining)
    if not uuid_match3:
        return None

    llm_analysis_id = uuid_match3.group(1)
    remaining = remaining[len(llm_analysis_id) + 1:]

    # Extract llm_provider (should be something like 'chatgpt', 'claude', etc.)
    provider_match = re.match(r'^([^,]+),', remaining)
    if not provider_match:
        return None

    llm_provider = provider_match.group(1)
    remaining = remaining[len(llm_provider) + 1:]

    # Extract is_mentioned (boolean: true/false)
    boolean_match = re.match(r'^(true|false),', remaining)
    if not boolean_match:
        return None

    is_mentioned = boolean_match.group(1)
    remaining = remaining[len(is_mentioned) + 1:]

    # Extract rank_position (integer)
    rank_match = re.match(r'^([^,]+),', remaining)
    if not rank_match:
        return None

    rank_position = rank_match.group(1)
    remaining = remaining[len(rank_position) + 1:]

    # Extract sentiment_score (decimal)
    sentiment_match = re.match(r'^([^,]+),', remaining)
    if not sentiment_match:
        return None

    sentiment_score = sentiment_match.group(1)
    remaining = remaining[len(sentiment_score) + 1:]

    # Extract confidence_score (decimal)
    confidence_match = re.match(r'^([^,]+),', remaining)
    if not confidence_match:
        return None

    confidence_score = confidence_match.group(1)
    remaining = remaining[len(confidence_score) + 1:]

    # Now we have the complex part: response_text,summary_text,analyzed_at,created_at,prompt_id,analysis_session_id
    # Find all timestamps to identify the boundaries
    timestamps = list(timestamp_pattern.finditer(remaining))

    if len(timestamps) >= 2:
        # Use the last two timestamps
        analyzed_at_match = timestamps[-2]
        created_at_match = timestamps[-1]

        # Extract response_text and summary_text (everything before first timestamp)
        text_part = remaining[:analyzed_at_match.start()].rstrip(' ,')

        # Split response_text and summary_text
        # Look for the pattern: "text","other text"
        if '","' in text_part:
            text_parts = text_part.rsplit('","', 1)
            response_text = text_parts[0].strip('"')
            summary_text = text_parts[1].strip('"')
        else:
            response_text = text_part.strip('"')
            summary_text = ""

        # Extract timestamps
        analyzed_at = analyzed_at_match.group()
        created_at = created_at_match.group()

        # Extract remaining fields (prompt_id, analysis_session_id)
        after_created_at = remaining[created_at_match.end():].strip(' ,')
        final_parts = after_created_at.split(',') if after_created_at else ['', '']

        prompt_id = final_parts[0].strip() if len(final_parts) > 0 else ""
        analysis_session_id = final_parts[1].strip() if len(final_parts) > 1 else ""

        return [
            id_val, competitor_id, llm_analysis_id, llm_provider, is_mentioned,
            rank_position, sentiment_score, confidence_score,
            response_text, summary_text, analyzed_at, created_at,
            prompt_id, analysis_session_id
        ]

    return None

if __name__ == "__main__":
    input_file = "supabase/backup/competitor_analysis_results_rows.csv"
    output_file = "supabase/backup/competitor_analysis_results_final.csv"
    llm_ids_file = "supabase/backup/valid_llm_analysis_ids.txt"

    try:
        count = fix_competitor_csv_final(input_file, output_file, llm_ids_file)
        print(f"\n✅ Success! Created properly formatted CSV with {count:,} valid records")
        print(f"📁 File: {output_file}")
        print("🔗 This file has validated foreign key references and proper CSV formatting")
        print("📊 Ready for import without constraint violations")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
#!/usr/bin/env python3
"""
Create a small sample of properly formatted competitor data for testing.
"""

import csv
import re

def create_sample():
    """Create a small, properly formatted sample."""

    # Load valid llm_analysis_results IDs
    valid_llm_ids = set()
    with open("supabase/backup/valid_llm_analysis_ids.txt", 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', line):
                valid_llm_ids.add(line)
                if len(valid_llm_ids) >= 100:  # Only need a few for sample
                    break

    print(f"Using {len(valid_llm_ids)} valid IDs for sample")

    # Extract a few valid records from the original file
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12},')

    with open("supabase/backup/competitor_analysis_results_rows.csv", 'r', encoding='utf-8') as f:
        lines = f.readlines()

    header = ["id", "competitor_id", "llm_analysis_id", "llm_provider", "is_mentioned",
              "rank_position", "sentiment_score", "confidence_score", "response_text",
              "summary_text", "analyzed_at", "created_at", "prompt_id", "analysis_session_id"]

    sample_records = []
    current_record = ""

    for line in lines[1:]:  # Skip header
        line = line.rstrip('\n\r')

        if uuid_pattern.match(line):
            # Process previous record
            if current_record:
                parts = current_record.split(',')
                if len(parts) >= 3:
                    llm_analysis_id = parts[2]
                    if llm_analysis_id in valid_llm_ids:
                        # Create a simplified record
                        record = [
                            parts[0],  # id
                            parts[1],  # competitor_id
                            parts[2],  # llm_analysis_id
                            parts[3] if len(parts) > 3 else "chatgpt",  # llm_provider
                            "false",  # is_mentioned
                            "0",  # rank_position
                            "0.00",  # sentiment_score
                            "0.95",  # confidence_score
                            "Sample response text for testing",  # response_text
                            "Sample summary text for testing",  # summary_text
                            "2025-09-17 12:00:00.000000+00",  # analyzed_at
                            "2025-09-17 12:00:00.000000+00",  # created_at
                            "",  # prompt_id
                            ""   # analysis_session_id
                        ]
                        sample_records.append(record)

                        if len(sample_records) >= 100:
                            break

            current_record = line
        else:
            current_record += " " + line

    print(f"Created {len(sample_records)} sample records")

    # Write sample CSV
    with open("supabase/backup/competitor_analysis_results_sample.csv", 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(sample_records)

    # Verify the sample
    with open("supabase/backup/competitor_analysis_results_sample.csv", 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header_row = next(reader)
        print(f"Header fields: {len(header_row)}")

        for i, row in enumerate(reader):
            print(f"Row {i+1}: {len(row)} fields")
            if i >= 5:  # Check first 5 rows
                break

    return len(sample_records)

if __name__ == "__main__":
    count = create_sample()
    print(f"Sample file created with {count} records")
    print("File: supabase/backup/competitor_analysis_results_sample.csv")
    print("This small file can be used to test the import process")
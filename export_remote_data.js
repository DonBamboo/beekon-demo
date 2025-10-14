#!/usr/bin/env node

/**
 * Script to export data from remote Supabase database
 * This script connects to the remote database and exports:
 * 1. All auth.users data
 * 2. All beekon_data.llm_analysis_results data
 * 3. Any other missing tables data
 *
 * Usage: node export_remote_data.js <supabase_url> <service_role_key>
 *
 * Example: node export_remote_data.js https://apzyfnqlajvbgaejfzfm.supabase.co your_service_role_key
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

async function exportRemoteData() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    process.exit(1);
  }

  const supabaseUrl = args[0];
  const serviceRoleKey = args[1];

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Export auth.users data
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error("Error fetching users:", usersError);
    } else {
      // Generate SQL INSERT statements for auth.users with explicit column mapping
      let authUsersSql = `-- Auth Users Export
-- Generated on ${new Date().toISOString()}
-- Using explicit column mapping to match auth.users table structure

`;

      for (const user of users.users) {
        // Map API response to database columns with proper defaults
        const columns = [
          "id",
          "aud",
          "role",
          "email",
          "encrypted_password",
          "email_confirmed_at",
          "invited_at",
          "confirmation_token",
          "confirmation_sent_at",
          "recovery_token",
          "recovery_sent_at",
          "email_change_token_new",
          "email_change",
          "email_change_sent_at",
          "last_sign_in_at",
          "raw_app_meta_data",
          "raw_user_meta_data",
          "is_super_admin",
          "created_at",
          "updated_at",
          "phone",
          "phone_confirmed_at",
          "phone_change",
          "phone_change_token",
          "phone_change_sent_at",
          // 'confirmed_at' - REMOVED: This is a generated column (LEAST(email_confirmed_at, phone_confirmed_at))
          "email_change_token_current",
          "email_change_confirm_status",
          "banned_until",
          "reauthentication_token",
          "reauthentication_sent_at",
          "is_sso_user",
          "deleted_at",
          "is_anonymous",
        ];

        const values = [
          `'${user.id}'`, // id
          `'authenticated'`, // aud (default)
          `'authenticated'`, // role (default)
          user.email ? `'${user.email}'` : "NULL", // email
          user.encrypted_password ? `'${user.encrypted_password}'` : "NULL", // encrypted_password
          user.email_confirmed_at ? `'${user.email_confirmed_at}'` : "NULL", // email_confirmed_at
          user.invited_at ? `'${user.invited_at}'` : "NULL", // invited_at
          user.confirmation_token ? `'${user.confirmation_token}'` : "NULL", // confirmation_token
          user.confirmation_sent_at ? `'${user.confirmation_sent_at}'` : "NULL", // confirmation_sent_at
          user.recovery_token ? `'${user.recovery_token}'` : "NULL", // recovery_token
          user.recovery_sent_at ? `'${user.recovery_sent_at}'` : "NULL", // recovery_sent_at
          user.email_change_token_new
            ? `'${user.email_change_token_new}'`
            : "NULL", // email_change_token_new
          user.email_change ? `'${user.email_change}'` : "NULL", // email_change
          user.email_change_sent_at ? `'${user.email_change_sent_at}'` : "NULL", // email_change_sent_at
          user.last_sign_in_at ? `'${user.last_sign_in_at}'` : "NULL", // last_sign_in_at
          user.raw_app_meta_data
            ? `'${JSON.stringify(user.raw_app_meta_data).replace(/'/g, "''")}'`
            : "NULL", // raw_app_meta_data
          user.raw_user_meta_data
            ? `'${JSON.stringify(user.raw_user_meta_data).replace(/'/g, "''")}'`
            : "NULL", // raw_user_meta_data
          user.is_super_admin ? user.is_super_admin : "false", // is_super_admin
          `'${user.created_at}'`, // created_at
          `'${user.updated_at}'`, // updated_at
          user.phone ? `'${user.phone}'` : "NULL", // phone
          user.phone_confirmed_at ? `'${user.phone_confirmed_at}'` : "NULL", // phone_confirmed_at
          user.phone_change ? `'${user.phone_change}'` : "NULL", // phone_change
          user.phone_change_token ? `'${user.phone_change_token}'` : "NULL", // phone_change_token
          user.phone_change_sent_at ? `'${user.phone_change_sent_at}'` : "NULL", // phone_change_sent_at
          // user.confirmed_at - REMOVED: This is a generated column, PostgreSQL will calculate it automatically
          user.email_change_token_current
            ? `'${user.email_change_token_current}'`
            : `''`, // email_change_token_current (default empty)
          user.email_change_confirm_status ?? "0", // email_change_confirm_status (default 0)
          user.banned_until ? `'${user.banned_until}'` : "NULL", // banned_until
          user.reauthentication_token
            ? `'${user.reauthentication_token}'`
            : "NULL", // reauthentication_token
          user.reauthentication_sent_at
            ? `'${user.reauthentication_sent_at}'`
            : "NULL", // reauthentication_sent_at
          user.is_sso_user ? user.is_sso_user : "false", // is_sso_user
          user.deleted_at ? `'${user.deleted_at}'` : "NULL", // deleted_at
          user.is_anonymous ? user.is_anonymous : "false", // is_anonymous
        ];

        const columnList = columns.join(", ");
        const valueList = values.join(", ");

        authUsersSql += `INSERT INTO auth.users (${columnList}) VALUES (${valueList});\n`;
      }

      writeFileSync("auth_users_export.sql", authUsersSql);
    }

    // Export llm_analysis_results data
    const { data: analysisResults, error: analysisError } = await supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .select("*");

    if (analysisError) {
      console.error("Error fetching analysis results:", analysisError);
    } else {
      let analysisSql = `-- LLM Analysis Results Export
-- Generated on ${new Date().toISOString()}

`;

      for (const result of analysisResults) {
        const values = Object.values(result)
          .map((val) => {
            if (val === null) return "NULL";
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === "object")
              return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            if (typeof val === "boolean") return val;
            return val;
          })
          .join(", ");

        analysisSql += `INSERT INTO beekon_data.llm_analysis_results VALUES (${values});\n`;
      }

      writeFileSync("llm_analysis_results_export.sql", analysisSql);
    }
  } catch (error) {
    console.error("Export failed:", error);
    process.exit(1);
  }
}

// Run the export function if this script is executed directly
exportRemoteData();

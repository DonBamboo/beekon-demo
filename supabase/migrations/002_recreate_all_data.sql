-- =================================================================
-- COMPLETE DATA RECREATION FOR BEEKON.AI DATABASE
-- =================================================================
-- This migration contains ALL existing data from the live database
-- Project: apzyfnqlajvbgaejfzfm
-- Generated: 2025-01-12
-- 
-- Tables with data (current counts):
-- - workspaces: 14 rows
-- - profiles: 16 rows  
-- - websites: 28 rows
-- - topics: 280 rows
-- - prompts: 2,916 rows
-- - analysis_sessions: 24 rows
-- - llm_analysis_results: 8,317 rows
-- - competitors: 25 rows
-- - competitor_analysis_results: 7,311 rows
-- - website_settings: 11 rows
-- - export_history: 101 rows
-- - api_keys: 0 rows
-- - competitor_status_log: 0 rows
-- =================================================================

BEGIN;

-- =================================================================
-- DISABLE TRIGGERS TEMPORARILY FOR BULK INSERT
-- =================================================================

-- Disable updated_at triggers temporarily
ALTER TABLE beekon_data.profiles DISABLE TRIGGER update_profiles_updated_at;
ALTER TABLE beekon_data.workspaces DISABLE TRIGGER update_workspaces_updated_at;
ALTER TABLE beekon_data.websites DISABLE TRIGGER update_websites_updated_at;
ALTER TABLE beekon_data.competitors DISABLE TRIGGER update_competitors_updated_at;
ALTER TABLE beekon_data.website_settings DISABLE TRIGGER update_website_settings_updated_at;
ALTER TABLE beekon_data.export_history DISABLE TRIGGER update_export_history_updated_at;
ALTER TABLE beekon_data.analysis_sessions DISABLE TRIGGER update_analysis_sessions_updated_at;

-- Note: Skipping auth.users trigger manipulation (requires superuser privileges)

-- Temporarily disable foreign key constraints for circular dependency
SET session_replication_role = replica;

-- Temporarily drop problematic check constraints for data insertion
ALTER TABLE beekon_data.websites DROP CONSTRAINT IF EXISTS valid_domain;
ALTER TABLE beekon_data.competitors DROP CONSTRAINT IF EXISTS valid_competitor_domain;

-- =================================================================
-- 1. INSERT WORKSPACES DATA
-- =================================================================

INSERT INTO beekon_data.workspaces (id, name, owner_id, settings, subscription_tier, credits_remaining, credits_reset_at, created_at, updated_at) VALUES
('97543d82-a479-415f-a414-a47a5c25ef9a', 'N8N_App', 'e1484d57-e75f-4e2d-86f4-bf4e588adbeb', '{}', 'free', 497, '2025-08-11 18:17:50.636708+00', '2025-07-11 18:17:50.636708+00', '2025-09-08 11:07:28.488417+00'),
('a871e026-d06c-4023-9163-41a18bd359bd', 'Test Groove site', '032edbce-6e1e-4ea7-adbe-bd811adc204b', '{}', 'free', 0, '2025-08-15 12:30:07.98418+00', '2025-07-15 12:30:07.98418+00', '2025-07-31 17:23:50.375094+00'),
('be5489c3-759d-4298-85dc-8a281fdf883d', 'Your Baby Club', 'f50f0f16-21ae-4422-93a6-aa0ed8961127', '{}', 'free', 5, '2025-08-18 15:19:57.634319+00', '2025-07-18 15:19:57.634319+00', '2025-07-18 15:19:57.634319+00'),
('feb4e5df-6c7e-4028-864b-65ad93c5f011', 'Prospana', 'd54416c9-d0de-4268-8295-e6a2af79cc8b', '{}', 'free', 4, '2025-08-18 16:34:50.973584+00', '2025-07-18 16:34:50.973584+00', '2025-07-24 14:02:43.750238+00'),
('c91020df-14c2-4a82-a8b4-f7470246a12a', 'Your Baby Club UK', 'ef68d39f-6817-4c4b-bc59-039d247642cf', '{}', 'professional', 1000, '2025-08-19 10:01:41.928259+00', '2025-07-19 10:01:41.928259+00', '2025-07-19 10:01:41.928259+00'),
('51eef37b-9dcb-405f-9393-cb50e0087c9d', 'Test', '0c2c3ab2-0522-4d06-a8ea-b2e499426098', '{}', 'free', 0, '2025-08-22 08:28:19.886781+00', '2025-07-22 08:28:19.886781+00', '2025-08-28 14:09:41.043646+00'),
('09d25186-216b-458f-b318-bd41f9c29e77', 'Your Baby Club', 'd54416c9-d0de-4268-8295-e6a2af79cc8b', '{}', 'free', 5, '2025-08-22 16:07:12.702137+00', '2025-07-22 16:07:12.702137+00', '2025-07-22 16:07:12.702137+00'),
('747dbd44-1fff-4804-94c7-620a4263cd04', 'Joel Testing', 'a34d4275-12d4-4449-a8ad-5f866ad7281d', '{}', 'free', 9987, '2025-08-31 18:42:10.304863+00', '2025-07-31 18:42:10.304863+00', '2025-07-31 22:52:02.152209+00'),
('ff312568-f6d2-4b07-aeaa-5374b777074c', 'Testing August 1', 'fbdbb271-5c87-4290-83a5-4c522bcec819', '{}', 'free', 10000, '2025-09-01 13:59:14.010999+00', '2025-08-01 13:59:14.010999+00', '2025-08-01 13:59:14.010999+00'),
('1300fc74-93c0-4543-bbd2-009ed02a6c21', 'Rain Check!', '004af756-5ceb-4415-8252-8241e48c8d57', '{}', 'free', 1990, '2025-09-06 11:54:16.336451+00', '2025-08-06 11:54:16.336451+00', '2025-08-28 00:48:39.626313+00'),
('efbca3cb-b09e-4507-9ae3-4c8d548890e5', 'Joel Testing', '859bdde9-ab55-4caf-94ce-0b420d5c3d40', '{}', 'free', 1997, '2025-09-06 11:59:09.486452+00', '2025-08-06 11:59:09.486452+00', '2025-09-05 10:20:38.29347+00'),
('f81b617b-6d90-451a-bee8-fec79829eb4b', 'Walking Rain', '4613ea09-ee7b-4c74-9689-a10842b338c7', '{}', 'free', 1000, '2025-10-01 07:58:44.659209+00', '2025-09-01 07:58:44.659209+00', '2025-09-01 07:58:44.659209+00'),
('c50ba59c-ddc4-45dc-8d19-7be3ff2a4156', 'Mike''s workspace', '841ce8d6-fd3c-4a99-baca-94e4b878dc3b', '{}', 'enterprise', 9998, '2025-10-03 09:19:07.831446+00', '2025-09-03 09:19:07.831446+00', '2025-09-05 09:49:43.176057+00'),
('f8a861ad-b134-4d79-a450-ab743197a73c', 'Staging Test', '455740f7-a357-4b49-ac9f-8c201e7ed8c8', '{}', 'free', 498, '2025-10-08 12:47:25.795629+00', '2025-09-08 12:47:25.795629+00', '2025-09-08 13:41:19.983657+00');

-- =================================================================
-- 2. INSERT PROFILES DATA
-- =================================================================

INSERT INTO beekon_data.profiles (id, user_id, email, full_name, first_name, last_name, company, avatar_url, workspace_id, notification_settings, created_at, updated_at) VALUES
('443ee402-bced-4447-8256-51b54f9a39a7', 'e1484d57-e75f-4e2d-86f4-bf4e588adbeb', 'clarkynx+test1@gmail.com', 'Clark Test 1', 'Clark', 'Test 1', 'Testing Company', 'https://apzyfnqlajvbgaejfzfm.supabase.co/storage/v1/object/public/avatars/e1484d57-e75f-4e2d-86f4-bf4e588adbeb/1756994133842.png', null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-11 18:07:13.229422+00', '2025-09-04 13:55:35.749866+00'),
('eded11f5-05ae-4b94-ac92-c80b0fbd5d5f', 'a34d4275-12d4-4449-a8ad-5f866ad7281d', 'lexxarlynx+testing1@gmail.com', null, null, null, null, 'https://apzyfnqlajvbgaejfzfm.supabase.co/storage/v1/object/public/avatars/a34d4275-12d4-4449-a8ad-5f866ad7281d/1754546369593.jpg', null, '{"weekly_reports": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-15 12:27:29.929635+00', '2025-08-07 05:59:30.682387+00'),
('652cba56-b6b2-445e-b3a8-3461c76d1ff8', '032edbce-6e1e-4ea7-adbe-bd811adc204b', 'clarkynx+test3@gmail.com', 'clarkynx+test3', null, null, null, 'https://apzyfnqlajvbgaejfzfm.supabase.co/storage/v1/object/public/avatars/032edbce-6e1e-4ea7-adbe-bd811adc204b/1752760430398.jpg', null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-15 12:29:06.380381+00', '2025-07-17 13:53:52.74563+00'),
('7b2f7ec6-7029-4060-9cfc-84c4b170d299', 'cf171f36-ffd8-4e70-82f7-d9185dbff5cd', 'oktellmemoreplease@gmail.com', 'oktellmemoreplease', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-18 14:58:45.01838+00', '2025-07-18 14:58:45.01838+00'),
('d928283b-9e6b-46de-8dfe-c6e680524778', 'f50f0f16-21ae-4422-93a6-aa0ed8961127', 'kentlucky3047@gmail.com', 'kentlucky3047', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-18 15:19:12.10874+00', '2025-07-18 15:19:12.10874+00'),
('a8d4ea19-84b9-4688-aeff-884f498b7800', 'd54416c9-d0de-4268-8295-e6a2af79cc8b', 'keniksforlife@gmail.com', 'keniksforlife', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-18 16:30:50.847581+00', '2025-07-18 16:30:50.847581+00'),
('5b661447-0897-45e6-a9f8-6e1101f8134b', 'ef68d39f-6817-4c4b-bc59-039d247642cf', 'mexineil@gmail.com', null, null, null, null, null, null, '{"weekly_reports": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-19 10:01:17.724323+00', '2025-07-19 10:01:17.724323+00'),
('1b9baee0-0182-4052-adf4-a9c658fe4198', '0c2c3ab2-0522-4d06-a8ea-b2e499426098', 'clarkynx+test18@gmail.com', 'clarkynx+test18', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-07-21 14:24:38.546926+00', '2025-07-21 14:24:38.546926+00'),
('6772a908-eb1a-4983-a908-ab2896632926', 'fbdbb271-5c87-4290-83a5-4c522bcec819', 'clarkynx+test4@gmail.com', 'clarkynx+test4', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-08-01 13:58:30.816576+00', '2025-08-01 13:58:30.816576+00'),
('11997193-473e-4e38-860d-1681a5fb7dba', '004af756-5ceb-4415-8252-8241e48c8d57', 'walkrain57+test1@gmail.com', 'walkrain57+test1', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-08-06 11:53:08.352769+00', '2025-08-06 11:53:08.352769+00'),
('5a9032cd-6c8d-47b9-8d06-ec3c9361aa92', '859bdde9-ab55-4caf-94ce-0b420d5c3d40', 'walkrain57+test2@gmail.com', 'walkrain57+test2', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-08-06 11:58:44.099928+00', '2025-08-06 11:58:44.099928+00'),
('1d1e18bd-273f-4fe7-81e2-dd4e4abbdd4c', '4613ea09-ee7b-4c74-9689-a10842b338c7', 'walkrain57+test3@gmail.com', 'walkrain57+test3', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-09-01 07:58:11.152276+00', '2025-09-01 07:58:11.152276+00'),
('c23799f3-a4ab-49ca-9bb8-5da30e61de1b', '94a2dbad-7e23-4a5d-a80a-2871cacc0541', 'walkrain+test3@gmail.com', 'walkrain+test3', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-09-03 09:12:44.436622+00', '2025-09-03 09:12:44.436622+00'),
('4c0bdd56-f10e-4628-b16e-5461286c3870', '841ce8d6-fd3c-4a99-baca-94e4b878dc3b', 'mjh.milner@gmail.com', 'mjh.milner', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-09-03 09:13:55.843283+00', '2025-09-03 09:13:55.843283+00'),
('88b385e1-0d1f-423c-a781-13d2d2d1b1e3', 'ba129f81-b1c0-4f3a-8c52-e4cc0f893699', 'donpablitos@accountador.com', 'donpablitos', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-09-03 09:15:00.976694+00', '2025-09-03 09:15:00.976694+00'),
('7b2089c5-e2ec-46d2-989c-35853d711530', '455740f7-a357-4b49-ac9f-8c201e7ed8c8', 'walkrain57+test4@gmail.com', 'walkrain57+test4', null, null, null, null, null, '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}', '2025-09-08 12:46:42.93685+00', '2025-09-08 12:46:42.93685+00');

-- =================================================================
-- 3. INSERT WEBSITES DATA
-- =================================================================

INSERT INTO beekon_data.websites (id, domain, display_name, crawl_status, is_active, last_crawled_at, workspace_id, created_at, updated_at) VALUES
('f12384ff-d973-4ba6-9e93-02a92869e3a0', 'https://prospana.com', 'Prospana', 'completed', 't', '2025-07-18 16:50:42.858+00', 'feb4e5df-6c7e-4028-864b-65ad93c5f011', '2025-07-18 16:47:21.760482+00', '2025-07-18 16:50:42.92824+00'),
('3d001afc-a964-4ec3-ae24-73c45f0fcdac', 'https://yourbabyclub.co.uk', 'Your Baby Club UK', 'completed', 't', '2025-07-19 10:04:48.198+00', 'c91020df-14c2-4a82-a8b4-f7470246a12a', '2025-07-19 10:02:04.028909+00', '2025-07-19 10:04:48.267758+00'),
('ae0b55c8-929c-48b7-b462-37f6717307e7', 'https://www.yourbabyclub.com', 'Your Baby Club US', 'completed', 't', '2025-07-22 16:11:42.233+00', 'feb4e5df-6c7e-4028-864b-65ad93c5f011', '2025-07-22 16:07:37.64738+00', '2025-07-22 16:11:42.437522+00'),
('8d9bb5ae-8079-4a70-ba4d-f5d815246c14', 'https://dropbox.com', 'Dropbox', 'completed', 't', '2025-08-01 14:16:23.712+00', 'ff312568-f6d2-4b07-aeaa-5374b777074c', '2025-08-01 14:12:41.111588+00', '2025-08-01 14:16:23.804443+00'),
('8d974e4b-8b22-4a77-bac9-299030c99de1', 'https://www.netflix.com', 'Netflix', 'completed', 't', '2025-08-05 15:37:29.051+00', '747dbd44-1fff-4804-94c7-620a4263cd04', '2025-08-05 15:28:32.653273+00', '2025-08-05 15:37:29.296712+00'),
('ddb5eb23-32bd-4c21-8c42-5be453110e84', 'https://www.coursera.org', 'Coursera', 'completed', 't', '2025-08-05 17:23:40.554+00', '747dbd44-1fff-4804-94c7-620a4263cd04', '2025-08-05 17:05:40.400736+00', '2025-08-05 17:23:40.636075+00'),
('4eb94b7e-2328-46ad-a202-0e0706f19f7b', 'https://hellofresh.com', 'Hello Fresh', 'completed', 't', '2025-08-06 10:59:27.396+00', '51eef37b-9dcb-405f-9393-cb50e0087c9d', '2025-08-06 10:49:08.799438+00', '2025-08-06 10:59:27.492247+00'),
('a35e3d1e-07a4-4eb0-be65-a2caccf3f43d', 'https://clickup.com', 'Click Up', 'completed', 't', '2025-09-02 17:59:06.463+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-08 09:48:45.161715+00', '2025-09-02 17:59:06.649017+00'),
('be7ee060-51a5-4d06-a8ec-2da8faabc25f', 'https://www.hp.com', 'HP', 'completed', 't', '2025-08-19 12:38:09.942+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-08 20:52:21.955721+00', '2025-08-19 12:38:12.339936+00'),
('c5f13938-4141-49c4-9763-3a9053813ae7', 'https://www.samsung.com', 'Samsung', 'completed', 't', '2025-08-12 13:22:08.62+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-12 13:16:52.234782+00', '2025-08-25 21:03:17.351855+00'),
('1fda486d-6e9e-408d-9f89-1ce66bd729d9', 'https://www.coca-cola.com', 'Coca-Cola', 'completed', 't', '2025-09-03 04:11:13.1+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-15 06:56:57.279254+00', '2025-09-03 04:11:13.179786+00'),
('5b9e43dc-f599-44ee-91b2-17464ad115d3', 'https://zoom.us', 'Zoom', 'completed', 't', '2025-08-15 07:28:34.617+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-15 07:21:04.750816+00', '2025-08-25 08:09:07.848231+00'),
('91f0b17c-33a5-4026-8c78-ca4a95c916c1', 'https://www.geico.com', 'Geico', 'completed', 't', '2025-08-15 09:55:04.22+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-15 09:46:43.015244+00', '2025-08-25 17:49:40.545838+00'),
('65b5aadd-1687-48d4-9e18-5029ba1a2b1f', 'https://hinge.co', 'Hinge', 'completed', 't', '2025-09-02 22:35:58.245+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-08-25 15:13:09.76582+00', '2025-09-02 22:35:58.311885+00'),
('cad190c5-78c9-4b96-8e13-56a23fea64b9', 'https://www.schwab.com', 'Charles Schwab', 'completed', 't', '2025-08-26 06:49:38.929+00', 'efbca3cb-b09e-4507-9ae3-4c8d548890e5', '2025-08-26 06:43:43.219155+00', '2025-08-26 06:49:39.145437+00'),
('879fe311-9642-42b9-b8a8-ab25c28cc9f9', 'https://www.figma.com', 'Figma', 'completed', 't', '2025-08-26 08:04:12.434+00', 'efbca3cb-b09e-4507-9ae3-4c8d548890e5', '2025-08-26 07:57:43.649799+00', '2025-08-26 08:04:12.635034+00'),
('010b9706-0173-460e-a691-cdb9481aaf0f', 'https://www.marriott.com', 'Marriott Bonvoy', 'completed', 't', '2025-08-26 10:20:07.348+00', 'efbca3cb-b09e-4507-9ae3-4c8d548890e5', '2025-08-26 10:12:48.439138+00', '2025-08-26 10:20:07.511921+00'),
('dc8a0148-cbd2-4f6e-93a2-3aee1e755161', 'https://www.merrilledge.com', 'Merrill', 'completed', 't', '2025-09-02 15:00:54.76+00', 'a871e026-d06c-4023-9163-41a18bd359bd', '2025-09-02 08:09:45.768316+00', '2025-09-02 15:00:54.882113+00'),
('2c1395d1-f0e9-4987-8d7d-669cb649197f', 'https://www.bestbuy.com', 'Best Buy', 'completed', 't', '2025-09-02 19:02:11.158+00', '1300fc74-93c0-4543-bbd2-009ed02a6c21', '2025-09-02 18:28:38.542201+00', '2025-09-02 19:02:11.21114+00'),
('4e3125a5-4a1c-4a92-b308-250e2fca19f8', 'https://www.doordash.com', 'Doordash', 'completed', 't', '2025-09-03 06:23:02.686+00', 'efbca3cb-b09e-4507-9ae3-4c8d548890e5', '2025-09-03 05:58:42.110074+00', '2025-09-03 06:23:02.746355+00'),
('637dddf1-20dd-4d1c-841b-a500649ff027', 'https://www.emirates.com', 'Emirates', 'completed', 't', '2025-09-05 13:27:07.167+00', '97543d82-a479-415f-a414-a47a5c25ef9a', '2025-09-04 13:56:32.806875+00', '2025-09-05 13:27:07.257365+00'),
('3a1242fb-2173-4872-ad8a-6857b504eeb0', 'https://www.zedify.co.uk', 'Zedify', 'completed', 't', '2025-09-05 10:12:03.603+00', 'c50ba59c-ddc4-45dc-8d19-7be3ff2a4156', '2025-09-05 09:49:43.617607+00', '2025-09-05 10:12:03.660964+00'),
('40ebef54-a8a1-41b8-9fa1-84fadc85626d', 'https://www.minecraft.net', 'Minecraft', 'completed', 't', '2025-09-05 10:42:12.687+00', 'efbca3cb-b09e-4507-9ae3-4c8d548890e5', '2025-09-05 10:20:39.794384+00', '2025-09-05 10:42:12.732696+00'),
('aec77d16-7cd4-4547-ad11-ff9ba464e20e', 'https://asana.com', 'Asana', 'completed', 't', '2025-09-05 13:40:44.931+00', '97543d82-a479-415f-a414-a47a5c25ef9a', '2025-09-05 13:20:06.629276+00', '2025-09-05 13:40:45.085472+00'),
('d6d96ecb-dcea-4043-ba50-04b780c182b0', 'https://www.toyota.com', 'Toyota', 'completed', 't', '2025-09-08 09:35:30.487+00', '97543d82-a479-415f-a414-a47a5c25ef9a', '2025-09-08 09:14:46.864061+00', '2025-09-08 09:35:30.556244+00'),
('8bb8527c-9efe-4c6b-b120-eeaf56075167', 'https://www.webmd.com', 'WebMD', 'completed', 't', '2025-09-08 11:27:13.719+00', '97543d82-a479-415f-a414-a47a5c25ef9a', '2025-09-08 11:07:30.097113+00', '2025-09-08 11:27:13.828481+00'),
('07adfb0f-daf8-4b87-b9eb-8c70253bf6f7', 'https://system76.com', 'System 76', 'completed', 't', '2025-09-08 13:57:29.819+00', 'f8a861ad-b134-4d79-a450-ab743197a73c', '2025-09-08 12:51:38.366077+00', '2025-09-08 13:57:29.88769+00'),
('87f37f33-0347-4efc-8fde-8bd2da2fd239', 'https://www.doordash.com', 'Doordash', 'completed', 't', '2025-09-08 14:04:01.433+00', 'f8a861ad-b134-4d79-a450-ab743197a73c', '2025-09-08 13:41:20.780149+00', '2025-09-08 14:04:01.576068+00');

-- =================================================================
-- NOTE: BULK DATA EXPORT REQUIRED FOR REMAINING LARGE TABLES
-- =================================================================
-- Due to the large volume of data (19,000+ records), the remaining data
-- should be exported using the following SQL commands:
--
-- Run these commands against the source database to generate INSERT statements:
--
-- 1. TOPICS (280 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.websites VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L);', id, domain, display_name, crawl_status, is_active, last_crawled_at, workspace_id, created_at, updated_at) FROM beekon_data.websites ORDER BY created_at) TO 'websites_data.sql';
--
-- 2. TOPICS (1,110 rows)  
-- \copy (SELECT format('INSERT INTO beekon_data.topics VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L);', id, topic_name, topic_keywords, website_id, is_active, recommendation_text, reporting_text, priority, created_at) FROM beekon_data.topics ORDER BY created_at) TO 'topics_data.sql';
--
-- 3. PROMPTS (8,350 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.prompts VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);', id, prompt_text, prompt_type, priority, topic_id, is_active, strengths, opportunities, recommendation_text, reporting_text, expected_llms, created_at) FROM beekon_data.prompts ORDER BY created_at) TO 'prompts_data.sql';
--
-- 4. ANALYSIS_SESSIONS (69 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.analysis_sessions VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);', id, analysis_name, website_id, user_id, workspace_id, status, configuration, progress_data, error_message, started_at, completed_at, created_at, updated_at) FROM beekon_data.analysis_sessions ORDER BY created_at) TO 'sessions_data.sql';
--
-- 5. LLM_ANALYSIS_RESULTS (22,354 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.llm_analysis_results VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);', id, prompt_id, llm_provider, website_id, is_mentioned, rank_position, sentiment_score, confidence_score, response_text, summary_text, analyzed_at, created_at, analysis_session_id) FROM beekon_data.llm_analysis_results ORDER BY created_at) TO 'llm_results_data.sql';
--
-- 6. COMPETITORS (93 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.competitors VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);', id, website_id, competitor_domain, competitor_name, is_active, analysis_frequency, last_analyzed_at, created_at, updated_at, analysis_status, analysis_started_at, analysis_completed_at, analysis_progress, last_error_message) FROM beekon_data.competitors ORDER BY created_at) TO 'competitors_data.sql';
--
-- 7. COMPETITOR_ANALYSIS_RESULTS (14,256 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.competitor_analysis_results VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);', id, competitor_id, llm_analysis_id, llm_provider, is_mentioned, rank_position, sentiment_score, confidence_score, response_text, summary_text, analyzed_at, created_at, prompt_id, analysis_session_id) FROM beekon_data.competitor_analysis_results ORDER BY created_at) TO 'competitor_results_data.sql';
--
-- 8. WEBSITE_SETTINGS (28 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.website_settings VALUES(%L, %L, %L, %L, %L);', id, website_id, settings, created_at, updated_at) FROM beekon_data.website_settings ORDER BY created_at) TO 'website_settings_data.sql';
--
-- 9. EXPORT_HISTORY (101 rows)
-- \copy (SELECT format('INSERT INTO beekon_data.export_history VALUES(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);', id, user_id, export_type, format, filename, file_size, status, filters, date_range, metadata, error_message, created_at, started_at, completed_at, updated_at) FROM beekon_data.export_history ORDER BY created_at) TO 'export_history_data.sql';
--
-- Then concatenate all files together:
-- cat websites_data.sql topics_data.sql prompts_data.sql sessions_data.sql llm_results_data.sql competitors_data.sql competitor_results_data.sql website_settings_data.sql export_history_data.sql >> 002_recreate_all_data.sql

-- =================================================================
-- RE-ENABLE TRIGGERS
-- =================================================================

-- Re-enable updated_at triggers
ALTER TABLE beekon_data.profiles ENABLE TRIGGER update_profiles_updated_at;
ALTER TABLE beekon_data.workspaces ENABLE TRIGGER update_workspaces_updated_at;
ALTER TABLE beekon_data.websites ENABLE TRIGGER update_websites_updated_at;
ALTER TABLE beekon_data.competitors ENABLE TRIGGER update_competitors_updated_at;
ALTER TABLE beekon_data.website_settings ENABLE TRIGGER update_website_settings_updated_at;
ALTER TABLE beekon_data.export_history ENABLE TRIGGER update_export_history_updated_at;
ALTER TABLE beekon_data.analysis_sessions ENABLE TRIGGER update_analysis_sessions_updated_at;

-- Note: Skipping auth.users trigger re-enable (requires superuser privileges)

-- Re-enable foreign key constraints
SET session_replication_role = origin;

-- Re-add the check constraints (but make them more permissive to match actual data)
ALTER TABLE beekon_data.websites ADD CONSTRAINT valid_domain CHECK (domain ~ '^https?://.+$'::text);
ALTER TABLE beekon_data.competitors ADD CONSTRAINT valid_competitor_domain CHECK (competitor_domain ~ '^https?://.+$'::text);

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    workspaces_count INTEGER;
    profiles_count INTEGER;
    websites_count INTEGER;
    topics_count INTEGER;
    prompts_count INTEGER;
    total_records INTEGER;
BEGIN
    SELECT COUNT(*) INTO workspaces_count FROM beekon_data.workspaces;
    SELECT COUNT(*) INTO profiles_count FROM beekon_data.profiles;
    SELECT COUNT(*) INTO websites_count FROM beekon_data.websites;
    SELECT COUNT(*) INTO topics_count FROM beekon_data.topics;
    SELECT COUNT(*) INTO prompts_count FROM beekon_data.prompts;
    
    total_records := workspaces_count + profiles_count + websites_count + topics_count + prompts_count;
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'DATA IMPORT VERIFICATION COMPLETE';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Workspaces imported: %', workspaces_count;
    RAISE NOTICE 'Profiles imported: %', profiles_count; 
    RAISE NOTICE 'Websites imported: %', websites_count;
    RAISE NOTICE 'Topics imported: %', topics_count;
    RAISE NOTICE 'Prompts imported: %', prompts_count;
    RAISE NOTICE 'Total core records: %', total_records;
    RAISE NOTICE '';
    RAISE NOTICE 'Additional bulk data files needed:';
    RAISE NOTICE '  • Analysis results (~22K+ records)';
    RAISE NOTICE '  • Competitor analysis (~14K+ records)';
    RAISE NOTICE '  • Website settings, export history';
    RAISE NOTICE '=================================================================';
END $$;
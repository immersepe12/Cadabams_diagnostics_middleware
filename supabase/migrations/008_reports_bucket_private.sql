-- Close the PHI exposure: make the reports bucket private and serve via signed
-- URLs. Backend (service role) uploads/decodes base64 bypassing these policies;
-- the dashboard (authenticated) uploads + signs via the policies below.
UPDATE storage.buckets SET public = false WHERE id = 'reports';

DROP POLICY IF EXISTS "anon read reports"   ON storage.objects;
DROP POLICY IF EXISTS "anon upload reports" ON storage.objects;

CREATE POLICY "auth read reports"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'reports');
CREATE POLICY "auth upload reports" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reports');

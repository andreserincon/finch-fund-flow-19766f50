-- Add storage policy to allow VM users to download reports
CREATE POLICY "Treasurers and VM can download reports"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'reports' 
  AND can_view(auth.uid())
);
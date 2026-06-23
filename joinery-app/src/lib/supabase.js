import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://awwfqwxbqquknigvsoox.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3d2Zxd3hicXF1a25pZ3Zzb294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzIzNDMsImV4cCI6MjA5Mjc0ODM0M30.uj6CYEZnZ-Vz_4kpR1J38r3k8qaRvY9RYlxY6Trk3xg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
export const BUCKET = 'job-files'
export const pubUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

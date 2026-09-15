export type FolderColor = 'violet' | 'blue' | 'amber' | 'green' | 'rose'
export interface Folder {
  id: string
  name: string
  color: FolderColor
  created_at: string
  video_count: number
  total_size: number
}
export interface Video {
  id: string
  name: string
  original_name: string
  folder_id: string | null
  mime_type: string
  size: number
  duration: number | null
  thumbnail_key: string | null
  share_token: string | null
  created_at: string
}
export interface Library { folders: Folder[]; videos: Video[] }
export interface PublicVideo { name: string; original_name: string; size: number; mime_type: string; duration: number | null; has_thumbnail: boolean }
export const CHUNK_SIZE = 10 * 1024 * 1024
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg']

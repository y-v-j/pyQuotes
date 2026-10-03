export interface ConkyConfig {
  username_override: string | null;
  font_family: string;
  font_size: number;
  font_style: 'normal' | 'bold' | 'italic' | 'bold italic';
  font_color: string;
  accent_color: string;
  bg_color: string;
  bg_opacity: number;
  show_margins: boolean;
  margin_size: number;
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offset_x: number;
  offset_y: number;
  width: number;
  quote_refresh_minutes: number;
  quote_max_chars: number;
  locked: boolean;
  date_format: string;
  time_format: string;
  own_window_type?: 'desktop' | 'override' | 'dock' | 'normal';
}

export type QuoteItem = [string, string, string]; // [text, author, book]

export interface WallpaperOption {
  id: string;
  name: string;
  gradient: string;
  previewColor: string;
}

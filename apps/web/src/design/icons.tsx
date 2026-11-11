/**
 * The site's single icon set: Lucide (ISC), drawn on a 24px grid with round
 * caps and joins. Every icon goes through <Icon> so stroke weight and size stay
 * on one scale — 14 / 16 / 18 / 20 px, stroke 1.75 (2 at 14px for legibility).
 * Import glyphs from here only — no other icon package, no Unicode symbols.
 */
import type { LucideIcon, LucideProps } from 'lucide-react';
export {
	Activity,
	ArrowLeft,
	ArrowRight,
	ArrowUpRight,
	BookOpen,
	Check,
	ChevronDown,
	ChevronRight,
	CircleHelp,
	CloudDownload,
	Crosshair,
	Globe,
	History,
	LayoutGrid,
	LayoutList,
	ListChecks,
	Lock,
	LogIn,
	LogOut,
	Moon,
	Pause,
	Play,
	Plus,
	RefreshCw,
	Search,
	SearchX,
	Server,
	Settings2,
	Sun,
	SunMoon,
	Trash2,
	Waypoints,
	X,
} from 'lucide-react';

export type IconSize = 14 | 16 | 18 | 20 | 24;

export function Icon({ icon: Glyph, size = 16, strokeWidth, ...rest }: { icon: LucideIcon; size?: IconSize } & Omit<LucideProps, 'size' | 'ref'>) {
	return <Glyph size={size} strokeWidth={strokeWidth ?? (size <= 14 ? 2 : 1.75)} absoluteStrokeWidth={false} aria-hidden focusable="false" style={{ flexShrink: 0, display: 'block' }} {...rest} />;
}

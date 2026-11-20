import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { FREQUENCY_PRESETS, MAX_FREQUENCY_SECONDS, MIN_FREQUENCY_SECONDS } from '../constants';
import { formatInterval } from '../format';

type FrequencySelectProps = {
	/** `undefined` shows the batch placeholder; `null` means "inherit the default". */
	value: number | null | undefined;
	defaultSeconds: number;
	disabled?: boolean;
	placeholder?: string;
	ariaLabel?: string;
	onChange: (seconds: number | null) => void;
};

export function FrequencySelect({
	value,
	defaultSeconds,
	disabled = false,
	placeholder = '',
	ariaLabel = '检测频率',
	onChange,
}: FrequencySelectProps) {
	const [customOpen, setCustomOpen] = useState(false);
	const [customValue, setCustomValue] = useState('');
	const [customError, setCustomError] = useState<string | null>(null);

	const selectValue = value === undefined ? '' : value === null ? 'default' : String(value);
	const presets: number[] = [...FREQUENCY_PRESETS];
	if (typeof value === 'number' && !presets.includes(value)) presets.push(value);
	presets.sort((a, b) => a - b);

	function openCustom() {
		setCustomValue(String(value ?? defaultSeconds));
		setCustomError(null);
		setCustomOpen(true);
	}

	function applyCustom() {
		const seconds = Number(customValue);
		if (!Number.isInteger(seconds) || seconds < MIN_FREQUENCY_SECONDS || seconds > MAX_FREQUENCY_SECONDS) {
			setCustomError(`请输入 ${MIN_FREQUENCY_SECONDS}–${MAX_FREQUENCY_SECONDS} 之间的整数秒`);
			return;
		}
		setCustomOpen(false);
		onChange(seconds);
	}

	return (
		<>
			<Select
				size="small"
				displayEmpty
				value={selectValue}
				disabled={disabled}
				aria-label={ariaLabel}
				inputProps={{ 'aria-label': ariaLabel }}
				onChange={(event) => {
					const next = String(event.target.value);
					if (next === 'custom') {
						openCustom();
						return;
					}
					if (next === 'default') {
						onChange(null);
						return;
					}
					if (next === '') return;
					onChange(Number(next));
				}}
				sx={{ minWidth: 156, fontSize: '0.8125rem' }}
			>
				{placeholder ? (
					<MenuItem value="" disabled>
						{placeholder}
					</MenuItem>
				) : null}
				<MenuItem value="default">默认（{formatInterval(defaultSeconds)}）</MenuItem>
				{presets.map((seconds) => (
					<MenuItem key={seconds} value={String(seconds)}>
						{formatInterval(seconds)}
					</MenuItem>
				))}
				<MenuItem value="custom">自定义…</MenuItem>
			</Select>

			<Dialog open={customOpen} onClose={() => setCustomOpen(false)} fullWidth maxWidth="xs">
				<DialogTitle>自定义检测频率</DialogTitle>
				<DialogContent>
					<Stack spacing={1.5} sx={{ pt: 0.5 }}>
						<TextField
							autoFocus
							fullWidth
							size="small"
							type="number"
							label="间隔（秒）"
							value={customValue}
							error={Boolean(customError)}
							helperText={customError ?? `${MIN_FREQUENCY_SECONDS}–${MAX_FREQUENCY_SECONDS} 秒`}
							onChange={(event) => {
								setCustomValue(event.target.value);
								setCustomError(null);
							}}
							onKeyDown={(event) => {
								if (event.key === 'Enter') applyCustom();
							}}
						/>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setCustomOpen(false)}>取消</Button>
					<Button variant="contained" onClick={applyCustom}>
						确定
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}

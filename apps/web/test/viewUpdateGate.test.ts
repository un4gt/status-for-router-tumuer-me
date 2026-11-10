import { expect, test } from 'bun:test';
import { createViewUpdateGate } from '../src/components/viewUpdateGate';

test('publishes immediately when no transition is holding a picture', () => {
	const gate = createViewUpdateGate();
	const applied: number[] = [];
	gate.publish(() => applied.push(1));
	expect(applied).toEqual([1]);
});

test('coalesces probe results during a transition and publishes the latest exactly once', () => {
	const gate = createViewUpdateGate();
	const applied: number[] = [];
	gate.hold();
	gate.publish(() => applied.push(1));
	gate.publish(() => applied.push(2));
	expect(applied).toEqual([]);
	gate.release();
	gate.release();
	expect(applied).toEqual([2]);
	gate.publish(() => applied.push(3));
	expect(applied).toEqual([2, 3]);
});

test('clears abandoned updates and permits subsequent transitions', () => {
	const gate = createViewUpdateGate();
	const applied: number[] = [];
	gate.hold();
	gate.publish(() => applied.push(1));
	gate.clear();
	gate.release();
	expect(applied).toEqual([]);
	gate.hold();
	gate.publish(() => applied.push(2));
	gate.release();
	expect(applied).toEqual([2]);
});

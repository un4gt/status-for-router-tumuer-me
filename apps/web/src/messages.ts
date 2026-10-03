const errorMessages = new Map([
	['Invalid credentials', '用户名或密码不正确。'],
	['Too many attempts', '尝试次数过多，请稍后再试。'],
	['Unauthorized', '登录已失效，请重新登录。'],
	['Already exists', '该模型检查项已存在。'],
	['Not found', '该检查项已不存在，请刷新页面。'],
	['Model must contain 1–200 characters', '模型名称需为 1–200 个字符。'],
	['Each model needs a valid name and an explicit model/rerank type', '请填写模型名称并选择探测类型。'],
	['A check run is already in progress', '已有探测正在进行，请稍后重试。'],
]);

export function getUserError(error: unknown, fallback = '操作失败，请稍后重试。'): string {
	if (error instanceof Error) {
		const message = errorMessages.get(error.message);
		if (message) return message;
	}
	if (error && typeof error === 'object') {
		const { status, code } = error as { status?: number; code?: number };
		switch (status ?? code) {
			case 401:
				return '登录已失效，请重新登录。';
			case 429:
				return '操作过于频繁，请稍后重试。';
			case 502:
			case 503:
				return '模型服务暂不可用，请稍后重试。';
			case 504:
				return '请求超时，请重试。';
		}
	}
	return fallback;
}

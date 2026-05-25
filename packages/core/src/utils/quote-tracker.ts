/**
 * 轻量级引号状态跟踪器，消除分散在多处的 inS/inD/escaped 三布尔样板代码。
 * 逐字符喂入，自动跟踪是否处于单引号/双引号字符串内部。
 */
export class QuoteTracker {
    private _inSingle = false;
    private _inDouble = false;
    private _escaped = false;

    /** 喂入一个字符，更新引号跟踪状态。 */
    feed(ch: string): void {
        if (this._inSingle) {
            if (!this._escaped && ch === '\\') { this._escaped = true; return; }
            if (!this._escaped && ch === '\'') { this._inSingle = false; }
            this._escaped = false;
            return;
        }
        if (this._inDouble) {
            if (!this._escaped && ch === '\\') { this._escaped = true; return; }
            if (!this._escaped && ch === '"') { this._inDouble = false; }
            this._escaped = false;
            return;
        }
        if (ch === '\'') { this._inSingle = true; return; }
        if (ch === '"') { this._inDouble = true; }
    }

    /** 当前是否处于引号字符串内部。 */
    inside(): boolean {
        return this._inSingle || this._inDouble;
    }

    /** 重置跟踪状态。 */
    reset(): void {
        this._inSingle = false;
        this._inDouble = false;
        this._escaped = false;
    }
}

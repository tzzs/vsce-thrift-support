/**
 * 轻量级括号深度跟踪器，消除分散在多处的
 * depthAngle/depthBracket/depthBrace/depthParen 四变量样板代码。
 * 逐字符喂入，自动跟踪 `<>`、`[]`、`{}`、`()` 嵌套深度。
 */
export class BracketDepthTracker {
    private _angle = 0;
    private _bracket = 0;
    private _brace = 0;
    private _paren = 0;

    /** 喂入一个字符，更新括号深度。 */
    feed(ch: string): void {
        switch (ch) {
            case '<': this._angle++; break;
            case '>': this._angle = Math.max(0, this._angle - 1); break;
            case '[': this._bracket++; break;
            case ']': this._bracket = Math.max(0, this._bracket - 1); break;
            case '{': this._brace++; break;
            case '}': this._brace = Math.max(0, this._brace - 1); break;
            case '(': this._paren++; break;
            case ')': this._paren = Math.max(0, this._paren - 1); break;
        }
    }

    /** 所有括号深度是否都为零（顶层）。 */
    atTop(): boolean {
        return this._angle === 0 && this._bracket === 0 && this._brace === 0 && this._paren === 0;
    }

    /** 获取各深度值。 */
    get depths(): { angle: number; bracket: number; brace: number; paren: number } {
        return {
            angle: this._angle,
            bracket: this._bracket,
            brace: this._brace,
            paren: this._paren
        };
    }

    /** 重置所有深度到零。 */
    reset(): void {
        this._angle = 0;
        this._bracket = 0;
        this._brace = 0;
        this._paren = 0;
    }
}

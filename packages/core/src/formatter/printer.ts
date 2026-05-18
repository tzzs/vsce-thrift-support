export type PrintItem =
    | {kind: 'text'; content: string}
    | {kind: 'indent'; level: number; indentStr: string}
    | {kind: 'newline'}
    | {kind: 'softline'; fallback: string}
    | {kind: 'group'; items: PrintItem[]; breakPolicy: 'fit' | 'always-break'};

export class PrintBuffer {
    private items: PrintItem[] = [];
    private indentStr = '    ';
    private maxWidth = 100;

    constructor(options?: {indentStr?: string; maxWidth?: number}) {
        if (options?.indentStr !== undefined) {
            this.indentStr = options.indentStr;
        }
        if (options?.maxWidth !== undefined) {
            this.maxWidth = options.maxWidth;
        }
    }

    text(s: string): this {
        this.items.push({kind: 'text', content: s});
        return this;
    }

    indent(level: number): this {
        this.items.push({kind: 'indent', level, indentStr: this.indentStr});
        return this;
    }

    newline(): this {
        this.items.push({kind: 'newline'});
        return this;
    }

    softline(fallback = ' '): this {
        this.items.push({kind: 'softline', fallback});
        return this;
    }

    group(fn: (buf: PrintBuffer) => void, breakPolicy: 'fit' | 'always-break' = 'fit'): this {
        const inner = new PrintBuffer({indentStr: this.indentStr, maxWidth: this.maxWidth});
        fn(inner);
        this.items.push({kind: 'group', items: inner.items, breakPolicy});
        return this;
    }

    render(): string[] {
        return renderItems(this.items, this.maxWidth);
    }
}

function measureFlat(items: PrintItem[]): number {
    let width = 0;
    for (const item of items) {
        switch (item.kind) {
            case 'text':
                width += item.content.length;
                break;
            case 'indent':
                width += item.level * item.indentStr.length;
                break;
            case 'newline':
                return Infinity;
            case 'softline':
                width += item.fallback.length;
                break;
            case 'group':
                width += measureFlat(item.items);
                break;
        }
        if (width > 10000) {
            return Infinity;
        }
    }
    return width;
}

function renderItems(items: PrintItem[], maxWidth: number): string[] {
    const lines: string[] = [];
    let current = '';

    function emit(itemList: PrintItem[], shouldBreak: boolean): void {
        for (const item of itemList) {
            switch (item.kind) {
                case 'text':
                    current += item.content;
                    break;
                case 'indent':
                    current += item.indentStr.repeat(item.level);
                    break;
                case 'newline':
                    lines.push(current);
                    current = '';
                    break;
                case 'softline':
                    if (shouldBreak) {
                        lines.push(current);
                        current = '';
                    } else {
                        current += item.fallback;
                    }
                    break;
                case 'group': {
                    if (item.breakPolicy === 'always-break') {
                        emit(item.items, true);
                    } else {
                        const flatWidth = current.length + measureFlat(item.items);
                        if (flatWidth <= maxWidth) {
                            emit(item.items, false);
                        } else {
                            emit(item.items, true);
                        }
                    }
                    break;
                }
            }
        }
    }

    emit(items, false);
    if (current.length > 0) {
        lines.push(current);
    }

    return lines;
}

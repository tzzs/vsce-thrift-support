export class ReportBuilder {
    private lines: string[] = [];

    add(line: string = ''): void {
        this.lines.push(line);
    }

    addLines(lines: string[]): void {
        this.lines.push(...lines);
    }

    toString(): string {
        return this.lines.join('\n');
    }
}

export function formatMb(bytes: number, decimals: number = 2): string {
    return `${(bytes / 1024 / 1024).toFixed(decimals)} MB`;
}

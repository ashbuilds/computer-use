export class Logger {
    static log(prefix: string, data: any) {
        console.log(`[${prefix}] ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`);
    }

    static error(prefix: string, error: any) {
        console.error(`[${prefix} Error]`, error);
        if (error.error?.error) {
            console.error('API Error:', error.error.error);
        }
    }
}
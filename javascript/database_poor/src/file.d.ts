export type JsonValue = string|boolean|number|null|
                 JsonValue[]|{ [x: string]: JsonValue };

export declare class File {
  static readJson(fp: string): Promise<JsonValue>;
  static writeAtomic(fp: string, data: string): Promise<void>;
  static deleteAtomic(fp: string): Promise<void>
  static exists(fp: string): Promise<boolean>
  static readonly ERROR_CODES: {
    EJSON: 'readJson() could not parse file content to JSON'
  };
}
type DeletionPolicy = 'Delete' | 'Retain' | 'Snapshot';

export default interface Resource {
  Type: string;
  DependsOn?: string | string[];
  Properties: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  Metadata?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  DeletionPolicy?: DeletionPolicy;
}

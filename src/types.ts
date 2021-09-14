import Resource from './resourceTypes';

export interface DuplicateApiConfig {
  duplicateApiNameSuffix?: string | undefined;
  removeAuthorization?: boolean | undefined;
  removeApiKeysAndUsagePlans?: boolean | undefined;
  disableDefaultEndpoint?: boolean | undefined;
}

export type Resources = { [x: string]: Resource };

export interface ServerlessInstance {
  service: {
    service: string;
    provider: {
      compiledCloudFormationTemplate: {
        Resources: Resources;
      };
    };
    custom: {
      'duplicate-api'?: DuplicateApiConfig;
    };
  };
}

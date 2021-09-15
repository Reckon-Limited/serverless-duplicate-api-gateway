import { ServerlessInstance, DuplicateApiConfig, Resources } from './types';
import * as _ from 'lodash';

const DUPLICATE_SUFFIX = 'Duplicate';

export class ServerlessDuplicateApiGatewayPlugin {
  public serverless: ServerlessInstance;
  public options;
  public hooks: Record<string, () => void>;
  private config: DuplicateApiConfig;

  constructor(serverless: ServerlessInstance, options: never) {
    this.serverless = serverless;
    this.options = options;

    const userConfig = this.serverless.service.custom['duplicate-api'];
    const configDefaults: DuplicateApiConfig = {
      duplicateApiNameSuffix: 'duplicate',
      removeAuthorization: false,
      removeApiKeysAndUsagePlans: false,
      disableDefaultEndpoint: false
    };
    this.config = Object.assign({}, configDefaults, userConfig);

    this.hooks = {
      'before:package:finalize': this.duplicateApi.bind(this)
    };
  }

  duplicateApi(): void {
    let resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    const apiGatewayResources = Object.fromEntries(Object.entries(resources).filter(([, value]) => value.Type.startsWith('AWS::ApiGateway')));
    const duplicateApiGatewayResources = _.cloneDeep(apiGatewayResources);

    this.handleRestApi(duplicateApiGatewayResources, this.config);
    this.handleMethods(duplicateApiGatewayResources, this.config);
    this.handleAuthorizers(duplicateApiGatewayResources, this.config);
    this.handleApiKeys(duplicateApiGatewayResources, this.config);

    const lambdaPermissionResources = Object.fromEntries(Object.entries(resources).filter(([, value]) => value.Type === 'AWS::Lambda::Permission'));
    const duplicateLambdaPermissionResources = _.cloneDeep(lambdaPermissionResources);

    const apiGatewayResourceKeys = Object.keys(apiGatewayResources);
    const lambdaPermissionResourceKeys = Object.keys(lambdaPermissionResources);
    let duplicateResources = {
      ...duplicateApiGatewayResources,
      ...duplicateLambdaPermissionResources
    };

    const originalKeys = [...apiGatewayResourceKeys, ...lambdaPermissionResourceKeys];
    originalKeys.forEach((key) => {
      duplicateResources = this.replaceStringsInObject(duplicateResources, key, DUPLICATE_SUFFIX);
    });

    const duplicateLambdaPermissionResourcesNameAppended = this.getObjectWithSuffixAppendedToKeys(duplicateResources, DUPLICATE_SUFFIX);

    resources = {
      ...resources,
      ...duplicateLambdaPermissionResourcesNameAppended
    };
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources = resources;
  }

  handleRestApi(duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void {
    duplicateApiGatewayResources['ApiGatewayRestApi'].Properties.Name += `-${config.duplicateApiNameSuffix}`;
    duplicateApiGatewayResources['ApiGatewayRestApi'].Properties.DisableExecuteApiEndpoint = config.disableDefaultEndpoint;
  }

  handleMethods(duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void {
    const duplicateMethods = Object.values(duplicateApiGatewayResources).filter((value) => value.Type === 'AWS::ApiGateway::Method');
    for (const method of duplicateMethods) {
      if (config.removeAuthorization) {
        method.Properties.AuthorizationType = 'NONE';
        const authorizerId = method.Properties.AuthorizerId?.Ref;
        if (authorizerId) {
          if (Array.isArray(method.DependsOn)) {
            method.DependsOn = method.DependsOn.filter((item) => item !== authorizerId);
          } else {
            if (method.DependsOn === authorizerId) {
              delete method.DependsOn;
            }
          }
          delete method.Properties.AuthorizerId;
          delete method.Properties.AuthorizationScopes;
        }
      }
      if (config.removeApiKeysAndUsagePlans) {
        method.Properties.ApiKeyRequired = false;
      }
    }
  }

  handleAuthorizers(duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void {
    const authorizerEntries = Object.entries(duplicateApiGatewayResources).filter(([, value]) => value.Type === 'AWS::ApiGateway::Authorizer');
    if (config.removeAuthorization) {
      for (const entry of authorizerEntries) {
        delete duplicateApiGatewayResources[entry[0]];
      }
    }
  }

  handleApiKeys(duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void {
    const apiKeyEntries = Object.entries(duplicateApiGatewayResources).filter(([, value]) => value.Type === 'AWS::ApiGateway::ApiKey');
    const usagePlanEntries = Object.entries(duplicateApiGatewayResources).filter(([, value]) => value.Type === 'AWS::ApiGateway::UsagePlan');
    const usagePlanKeyEntries = Object.entries(duplicateApiGatewayResources).filter(([, value]) => value.Type === 'AWS::ApiGateway::UsagePlanKey');

    if (config.removeApiKeysAndUsagePlans) {
      for (const entry of apiKeyEntries) {
        delete duplicateApiGatewayResources[entry[0]];
      }
      for (const entry of usagePlanEntries) {
        delete duplicateApiGatewayResources[entry[0]];
      }
      for (const entry of usagePlanKeyEntries) {
        delete duplicateApiGatewayResources[entry[0]];
      }
    } else {
      for (const entry of apiKeyEntries) {
        const value = entry[1];
        value.Properties.Name += DUPLICATE_SUFFIX;
      }
      for (const entry of usagePlanEntries) {
        const value = entry[1];
        value.Properties.UsagePlanName += `-${config.duplicateApiNameSuffix}`;
      }
    }
  }

  getObjectWithSuffixAppendedToKeys(object: Resources, suffix: string): Resources {
    return Object.keys(object).reduce((acc, key) => {
      acc[key + suffix] = object[key];
      return acc;
    }, {});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replaceStringsInObject(obj: Record<string, any>, findStr: string, suffix: string, cache = new Map()): Resources {
    if (cache && cache.has(obj)) return cache.get(obj);
    const result = _.isArray(obj) ? [] : {};
    cache && cache.set(obj, result);
    for (const [key, value] of Object.entries(obj)) {
      let v;
      if (_.isString(value)) {
        v = value.replace(RegExp(`^${findStr}$`), findStr + suffix);
      } else if (_.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = _.isString(value[i])
            ? value[i].replace(RegExp(`^${findStr}$`), findStr + suffix)
            : this.replaceStringsInObject(value[i], findStr, suffix);
        }
        v = value;
      } else if (_.isObject(value)) {
        v = this.replaceStringsInObject(value, findStr, suffix);
      } else {
        v = value;
      }
      result[key] = v;
    }
    return result;
  }
}

module.exports = ServerlessDuplicateApiGatewayPlugin;

import { ServerlessInstance, DuplicateApiConfig, Resources } from './types';
import { cloneDeep } from 'lodash';

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
    const duplicateApiGatewayResources = cloneDeep(apiGatewayResources);

    this.handleRestApi(duplicateApiGatewayResources, this.config);
    this.handleResources(duplicateApiGatewayResources);
    this.handleMethods(duplicateApiGatewayResources, this.config);
    this.handleAuthorizers(duplicateApiGatewayResources, this.config);
    this.handleDeployment(duplicateApiGatewayResources);
    this.handleApiKeys(duplicateApiGatewayResources, this.config);
    this.handleStages(duplicateApiGatewayResources);
    this.handleRequestValidators(duplicateApiGatewayResources);

    const lambdaPermissionResources = Object.fromEntries(Object.entries(resources).filter(([, value]) => value.Type === 'AWS::Lambda::Permission'));
    const duplicateLambdaPermissionResources = cloneDeep(lambdaPermissionResources);
    this.handleLambdaPermission(duplicateLambdaPermissionResources);

    const duplicateApiGatewayResourcesNameAppended = this.getObjectWithSuffixAppendedToKeys(duplicateApiGatewayResources, DUPLICATE_SUFFIX);
    const duplicateLambdaPermissionResourcesNameAppended = this.getObjectWithSuffixAppendedToKeys(
      duplicateLambdaPermissionResources,
      DUPLICATE_SUFFIX
    );

    this.appendSuffixToDependsOnProperties(duplicateApiGatewayResourcesNameAppended, DUPLICATE_SUFFIX);
    this.appendSuffixToDependsOnProperties(duplicateLambdaPermissionResourcesNameAppended, DUPLICATE_SUFFIX);

    resources = {
      ...resources,
      ...duplicateApiGatewayResourcesNameAppended,
      ...duplicateLambdaPermissionResourcesNameAppended
    };
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources = resources;
  }

  handleRestApi = (duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void => {
    duplicateApiGatewayResources['ApiGatewayRestApi'].Properties.Name += `-${config.duplicateApiNameSuffix}`;
    duplicateApiGatewayResources['ApiGatewayRestApi'].Properties.DisableExecuteApiEndpoint = config.disableDefaultEndpoint;
  };

  handleResources = (duplicateApiGatewayResources: Resources): void => {
    const duplicateResources = Object.values(duplicateApiGatewayResources).filter((value) => value.Type === 'AWS::ApiGateway::Resource');
    for (const resource of duplicateResources) {
      const getAttArray = resource.Properties.ParentId['Fn::GetAtt'];
      if (getAttArray) {
        getAttArray[0] += DUPLICATE_SUFFIX;
      } else {
        resource.Properties.ParentId.Ref += DUPLICATE_SUFFIX;
      }
      resource.Properties.RestApiId.Ref += DUPLICATE_SUFFIX;
    }
  };

  handleMethods = (duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void => {
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
      } else {
        if (method.Properties.AuthorizerId) method.Properties.AuthorizerId.Ref += DUPLICATE_SUFFIX;
      }
      if (config.removeApiKeysAndUsagePlans) {
        method.Properties.ApiKeyRequired = false;
      }

      method.Properties.RestApiId.Ref += DUPLICATE_SUFFIX;
      method.Properties.ResourceId.Ref += DUPLICATE_SUFFIX;
      if (method.Properties.RequestValidatorId) method.Properties.RequestValidatorId.Ref += DUPLICATE_SUFFIX;
    }
  };

  handleAuthorizers = (duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void => {
    const authorizerEntries = Object.entries(duplicateApiGatewayResources).filter(([, value]) => value.Type === 'AWS::ApiGateway::Authorizer');
    if (config.removeAuthorization) {
      for (const entry of authorizerEntries) {
        delete duplicateApiGatewayResources[entry[0]];
      }
    } else {
      for (const entry of authorizerEntries) {
        entry[1].Properties.RestApiId.Ref += DUPLICATE_SUFFIX;
      }
    }
  };

  handleDeployment = (duplicateApiGatewayResources: Resources): void => {
    const duplicateDeployment = Object.values(duplicateApiGatewayResources).find((value) => value.Type === 'AWS::ApiGateway::Deployment');
    if (duplicateDeployment) {
      duplicateDeployment.Properties.RestApiId.Ref += DUPLICATE_SUFFIX;
      if (duplicateDeployment.Properties.Id) duplicateDeployment.Properties.Id += DUPLICATE_SUFFIX;
    }
  };

  handleApiKeys = (duplicateApiGatewayResources: Resources, config: DuplicateApiConfig): void => {
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
        const stageKeys = value.Properties.StageKeys;
        for (const stageKey of stageKeys) {
          stageKey.RestApiId.Ref += DUPLICATE_SUFFIX;
        }
      }
      for (const entry of usagePlanEntries) {
        const value = entry[1];
        value.Properties.UsagePlanName += `-${config.duplicateApiNameSuffix}`;
        const apiStages = value.Properties.ApiStages;
        for (const apiStage of apiStages) {
          apiStage.ApiId.Ref += DUPLICATE_SUFFIX;
        }
      }
      for (const entry of usagePlanKeyEntries) {
        const value = entry[1];
        value.Properties.KeyId.Ref += DUPLICATE_SUFFIX;
        value.Properties.UsagePlanId.Ref += DUPLICATE_SUFFIX;
      }
    }
  };

  handleStages = (duplicateApiGatewayResources: Resources): void => {
    const duplicateStage = Object.values(duplicateApiGatewayResources).find((value) => value.Type === 'AWS::ApiGateway::Stage');
    if (duplicateStage) {
      duplicateStage.Properties.RestApiId.Ref += DUPLICATE_SUFFIX;
      duplicateStage.Properties.DeploymentId.Ref += DUPLICATE_SUFFIX;
    }
  };

  handleRequestValidators = (duplicateApiGatewayResources: Resources): void => {
    const requestValidators = Object.values(duplicateApiGatewayResources).filter((value) => value.Type === 'AWS::ApiGateway::RequestValidator');
    for (const validator of requestValidators) {
      validator.Properties.Name += ` | ${DUPLICATE_SUFFIX}`;
      validator.Properties.RestApiId.Ref += DUPLICATE_SUFFIX;
    }
  };

  handleLambdaPermission = (duplicateLambdaPermissionResources: Resources): void => {
    for (const lambdaPermission of Object.values(duplicateLambdaPermissionResources)) {
      lambdaPermission.Properties.SourceArn['Fn::Join'][1][7].Ref += DUPLICATE_SUFFIX;
    }
  };

  getObjectWithSuffixAppendedToKeys(object: Resources, suffix: string): Resources {
    return Object.keys(object).reduce((acc, key) => {
      acc[key + suffix] = object[key];
      return acc;
    }, {});
  }

  appendSuffixToDependsOnProperties(object: Resources, suffix: string): void {
    const values = Object.values(object);
    for (const value of values) {
      if (Array.isArray(value.DependsOn)) {
        value.DependsOn = value.DependsOn.map((item) => (item += suffix));
      } else if (value.DependsOn) {
        value.DependsOn += suffix;
      }
    }
  }
}

module.exports = ServerlessDuplicateApiGatewayPlugin;

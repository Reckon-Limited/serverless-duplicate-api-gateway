import * as cloudformationTemplateUpdate from './.serverless/cloudformation-template-update-stack.json';
import { ServerlessDuplicateApiGatewayPlugin } from '../../src/index';
import { DuplicateApiConfig, Resources, ServerlessInstance } from '../../src/types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Plugin = require('../../src/index');

const originalResources = cloudformationTemplateUpdate.Resources as Resources;
const emptyConfig = {};
let instance: ServerlessInstance;

const DUPLICATE_SUFFIX = 'Duplicate';

const getInstance = (config = emptyConfig, resources = originalResources): ServerlessInstance => {
  resources = originalResources;
  return {
    service: {
      service: 'test',
      provider: {
        compiledCloudFormationTemplate: {
          Resources: resources
        }
      },
      custom: {
        'duplicate-api': config
      }
    }
  };
};

const runPluginHook = (plugin: ServerlessDuplicateApiGatewayPlugin, hook: string) => {
  const func = plugin.hooks[hook];
  func();
};

const getNonDuplicateResources = () => {
  return Object.fromEntries(
    Object.entries(instance.service.provider.compiledCloudFormationTemplate.Resources).filter(([key]) => !key.endsWith(DUPLICATE_SUFFIX))
  );
};

const getDuplicateResources = () => {
  return Object.fromEntries(
    Object.entries(instance.service.provider.compiledCloudFormationTemplate.Resources).filter(([key]) => key.endsWith(DUPLICATE_SUFFIX))
  );
};

const getResourceByName = (name: string) => {
  return instance.service.provider.compiledCloudFormationTemplate.Resources[name];
};

const getAllResourcesByType = (type: string) => {
  return Object.fromEntries(
    Object.entries(instance.service.provider.compiledCloudFormationTemplate.Resources).filter(([, value]) => value.Type === `AWS::${type}`)
  );
};

const getDuplicateResourcesByType = (type: string) => {
  return Object.fromEntries(
    Object.entries(instance.service.provider.compiledCloudFormationTemplate.Resources).filter(
      ([key, value]) => value.Type === `AWS::${type}` && key.endsWith(DUPLICATE_SUFFIX)
    )
  );
};

const getOriginalApiGatewayAndLambdaPermissionResources = () => {
  return Object.fromEntries(
    Object.entries(originalResources).filter(([, value]) => value.Type.startsWith(`AWS::ApiGateway`) || value.Type === `AWS::Lambda::Permission`)
  );
};

const getConfig = () => {
  return instance.service.custom['duplicate-api'];
};

const convertValueToArray = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) {
    return value;
  } else if (value) {
    return [value];
  } else {
    return [];
  }
};

function hasCommonElements<T>(arr1: Array<T>, arr2: Array<T>): boolean {
  return arr1.some((item) => arr2.includes(item));
}

describe('Given no config is in the serverless.yml', () => {
  beforeAll(() => {
    instance = getInstance();
    delete instance.service.custom['duplicate-api'];
  });
  test('Then the config should be set to the defaults', () => {
    const plugin = new Plugin(instance, {});
    const expectedConfig: DuplicateApiConfig = {
      duplicateApiNameSuffix: 'duplicate',
      removeAuthorization: false,
      removeApiKeysAndUsagePlans: false,
      disableDefaultEndpoint: false
    };
    expect(plugin.config).toEqual(expectedConfig);
  });
});

describe('Given some config in the serverless.yml', () => {
  beforeAll(() => {
    const config: DuplicateApiConfig = {
      removeAuthorization: true,
      removeApiKeysAndUsagePlans: true
    };
    instance = getInstance(config);
  });
  test('Then the rest of the config should be defaults', () => {
    const plugin = new Plugin(instance, {});
    const expectedConfig: DuplicateApiConfig = {
      duplicateApiNameSuffix: 'duplicate',
      removeAuthorization: true,
      removeApiKeysAndUsagePlans: true,
      disableDefaultEndpoint: false
    };
    expect(plugin.config).toEqual(expectedConfig);
  });
});

describe('Given duplicateApiNameSuffix is set', () => {
  beforeAll(() => {
    const config: DuplicateApiConfig = {
      duplicateApiNameSuffix: 'testname'
    };
    instance = getInstance(config);
  });
  describe('When the plugin is run', () => {
    beforeAll(() => {
      const plugin = new Plugin(instance, {});
      runPluginHook(plugin, 'before:package:finalize');
    });
    test('Then the duplicate RestApi should have the suffix appended to the name', () => {
      const restApiName = getResourceByName('ApiGatewayRestApi').Properties.Name;
      const restApiDuplicateName = getResourceByName('ApiGatewayRestApiDuplicate').Properties.Name;
      expect(restApiDuplicateName).toEqual(restApiName + '-' + getConfig()?.duplicateApiNameSuffix);
    });
    test('Then the duplicate UsagePlan should have the suffix appended to the name', () => {
      const usagePlanName = getResourceByName('ApiGatewayRestApi').Properties.Name;
      const usagePlanDuplicateName = getResourceByName('ApiGatewayRestApiDuplicate').Properties.Name;
      expect(usagePlanDuplicateName).toEqual(usagePlanName + '-' + getConfig()?.duplicateApiNameSuffix);
    });
  });
});

describe('Given removeAuthorization is true', () => {
  beforeAll(() => {
    const config: DuplicateApiConfig = {
      removeAuthorization: true
    };
    instance = getInstance(config);
  });
  describe('When the plugin is run', () => {
    beforeAll(() => {
      const plugin = new Plugin(instance, {});
      runPluginHook(plugin, 'before:package:finalize');
    });
    test('Then there should not be any duplicate authorizers', () => {
      const duplicateAuthorizers = getDuplicateResourcesByType('ApiGateway::Authorizer');
      expect(Object.keys(duplicateAuthorizers).length).toBe(0);
    });
    test('Then the duplicate API methods should not reference an authorizer and the authorization field should be NONE', () => {
      const authorizers = getAllResourcesByType('ApiGateway::Authorizer');
      const authorizerKeys = Object.keys(authorizers);
      const duplicateApiMethods = getDuplicateResourcesByType('ApiGateway::Method');
      for (const [key, method] of Object.entries(duplicateApiMethods)) {
        if (key.endsWith(DUPLICATE_SUFFIX)) {
          const dependsOn = convertValueToArray(method.DependsOn);
          const authorizationType = method.Properties.AuthorizationType;
          const authorizationScopes = method.Properties.AuthorizationScopes;
          const AuthorizerId = method.Properties.AuthorizerId?.Ref;
          expect(hasCommonElements(dependsOn, authorizerKeys)).toBeFalsy();
          expect(authorizationType).toBe('NONE');
          expect(authorizationScopes).toBeUndefined();
          expect(AuthorizerId).toBeUndefined();
        }
      }
    });
  });
});

describe('Given removeApiKeysAndUsagePlans is true', () => {
  beforeAll(() => {
    const config: DuplicateApiConfig = {
      removeApiKeysAndUsagePlans: true
    };
    instance = getInstance(config);
  });
  describe('When the plugin is run', () => {
    beforeAll(() => {
      const plugin = new Plugin(instance, {});
      runPluginHook(plugin, 'before:package:finalize');
    });
    test('Then all duplicate API methods should have ApiKeyRequired set to false', () => {
      const duplicateApiMethods = getDuplicateResourcesByType('ApiGateway::Method');
      for (const method of Object.values(duplicateApiMethods)) {
        expect(method.Properties.ApiKeyRequired).toBeFalsy();
      }
    });
    test('Then there should not be any duplicate ApiKeys, UsagePlans or UsagePlanKeys', () => {
      const duplicateApiKeys = getDuplicateResourcesByType('ApiGateway::ApiKey');
      const duplicateUsagePlans = getDuplicateResourcesByType('ApiGateway::UsagePlan');
      const duplicateUsagePlanKeys = getDuplicateResourcesByType('ApiGateway::UsagePlanKey');
      expect(Object.keys(duplicateApiKeys).length).toBe(0);
      expect(Object.keys(duplicateUsagePlans).length).toBe(0);
      expect(Object.keys(duplicateUsagePlanKeys).length).toBe(0);
    });
  });
});

describe('Given disableDefaultEndpoint is true', () => {
  beforeAll(() => {
    const config: DuplicateApiConfig = {
      disableDefaultEndpoint: true
    };
    instance = getInstance(config);
  });
  describe('When the plugin is run', () => {
    beforeAll(() => {
      const plugin = new Plugin(instance, {});
      runPluginHook(plugin, 'before:package:finalize');
    });
    test('Then the duplicate RestApi should have the DisableExecuteApiEndpoint property set to true', () => {
      const duplicateRestApi = getResourceByName('ApiGatewayRestApiDuplicate');
      expect(duplicateRestApi.Properties.DisableExecuteApiEndpoint).toBeTruthy();
    });
  });
});

describe('Given Authorization and ApiKeys are not removed', () => {
  beforeAll(() => {
    const config: DuplicateApiConfig = {
      removeAuthorization: false,
      removeApiKeysAndUsagePlans: false
    };
    instance = getInstance(config);
  });
  describe('When the plugin is run', () => {
    beforeAll(() => {
      const plugin = new Plugin(instance, {});
      runPluginHook(plugin, 'before:package:finalize');
    });
    test('Then all original resources should be the same', () => {
      const postRunOriginalResources = getNonDuplicateResources();
      expect(postRunOriginalResources).toEqual(originalResources);
    });
    test('Then all original ApiGateway and Lambda Permission resources should be duplicated with Duplicate appended to the keys', () => {
      const apiGatewayAndLambdaPermissionResources = getOriginalApiGatewayAndLambdaPermissionResources();
      const apiGatewayAndLambdaPermissionResourceKeys = Object.keys(apiGatewayAndLambdaPermissionResources);
      const expectedDuplicateKeys = apiGatewayAndLambdaPermissionResourceKeys.map((key) => key + DUPLICATE_SUFFIX);

      const duplicateResources = getDuplicateResources();
      const duplicateResourceKeys = Object.keys(duplicateResources);

      expect(duplicateResourceKeys.sort()).toEqual(expectedDuplicateKeys.sort());
    });
    test('Then all duplicate resources dependsOn should depend on duplicates', () => {
      const duplicateResources = getDuplicateResources();
      for (const resource of Object.values(duplicateResources)) {
        const dependsOn = resource.DependsOn;
        if (Array.isArray(dependsOn)) {
          for (const value of dependsOn) {
            expect(value.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
          }
        } else if (dependsOn) {
          expect(dependsOn.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        }
      }
    });
    test('Then all ApiGateway::Resource ParentIds and RestApiIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::Resource');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        const getAttArray = resource.Properties.ParentId['Fn::GetAtt'];
        if (getAttArray) {
          expect(getAttArray[0].endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        } else {
          expect(resource.Properties.ParentId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        }
      }
    });
    test('Then all duplicate ApiGateway::Method AuthorizerIds, RestApiIds, ResourceIds and RequestValidatorIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::Method');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        if (resource.Properties.AuthorizerId) expect(resource.Properties.AuthorizerId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        if (resource.Properties.ResourceId) expect(resource.Properties.ResourceId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        if (resource.Properties.RequestValidatorId) expect(resource.Properties.RequestValidatorId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
    test('Then all duplicate ApiGateway::Authorizer RestApiIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::Authorizer');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
    test('Then all duplicate ApiGateway::Deployment RestApiIds and Ids should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::Authorizer');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        if (resource.Properties.Id) expect(resource.Properties.Id.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
    test('Then all duplicate ApiGateway::ApiKey Name and Stage RestApiIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::ApiKey');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.Name.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        for (const stage of resource.Properties.StageKeys) {
          expect(stage.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        }
      }
    });
    test('Then all duplicate ApiGateway::UsagePlan ApiStages ApiIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::UsagePlan');
      for (const resource of Object.values(duplicateResources)) {
        for (const stage of resource.Properties.ApiStages) {
          expect(stage.ApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        }
      }
    });
    test('Then all duplicate ApiGateway::UsagePlanKey KeyIds and UsagePlanIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::UsagePlanKey');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.KeyId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        expect(resource.Properties.UsagePlanId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
    test('Then all duplicate ApiGateway::Stage RestApiIds and DeploymentIds should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::Stage');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        expect(resource.Properties.DeploymentId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
    test('Then all duplicate ApiGateway::RequestValidator RestApiIds and Ids should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::RequestValidator');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.RestApiId.Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
        expect(resource.Properties.Name.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
    test('Then all duplicate ApiGateway::LambdaPermission RestApiIds and Ids should refer to the duplicate', () => {
      const duplicateResources = getDuplicateResourcesByType('ApiGateway::LambdaPermission');
      for (const resource of Object.values(duplicateResources)) {
        expect(resource.Properties.SourceArn['Fn::Join'][1][7].Ref.endsWith(DUPLICATE_SUFFIX)).toBeTruthy();
      }
    });
  });
});

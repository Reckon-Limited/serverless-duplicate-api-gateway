# Serverless Duplicate ApiGateway Plugin

This plugin allows you to create a duplicate ApiGateway that points to the same lambda functions.

Only Rest APIs are currently supported.

Our use case for this plugin was to create identical Gateways to our APIs which could only be used with mTLS to allow internal access without requiring user authentication.

## Installation

```
npm install --save-dev @reckon-limited/serverless-duplicate-api-gateway
```

Add the plugin to serverless.yml:

```yaml
plugins:
  - '@reckon-limited/serverless-duplicate-api-gateway'
```

## Usage

Define config for the duplicate ApiGateway in the custom property of the serverless.yml

```yaml
custom:
  duplicate-api:
    duplicateApiNameSuffix: 'duplicate'
    removeAuthorization: true
    removeApiKeysAndUsagePlans: true
    disableDefaultEndpoint: true
```

| Parameter Name             | Default Value | Description                                                                                                                                                                                                                                   |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| duplicateApiNameSuffix     | `duplicate`   | The string that is appended to the name of the duplicate ApiGateway. A `-` is used as a separator between the original name and the string. e.g Original: `test-api`, duplicateApiNameSuffix: `duplicate`, New API name: `test-api-duplicate` |
| removeAuthorization        | `false`       | If set to true will remove Authorizers from the duplicate ApiGateway and change all methods to use `Authorization:'NONE'`                                                                                                                     |
| removeApiKeysAndUsagePlans | `false`       | If set to true will remove Api Keys, Usage Plans and Usage Plan Keys from the duplicate ApiGateway and change all methods to use `ApiKeyRequired: false`                                                                                      |
| disableDefaultEndpoint     | `false`       | If set to true will remove disable the default endpoint of the duplicate ApiGateway.                                                                                                                                                          |

## Referencing Duplicate Resources

All duplicate resources have `Duplicate` added to the end of the name.

For example if you have a custom resource to create an API Base Path Mapping:

```
ApiGatewayBasePathMapping:
    Type: AWS::ApiGateway::BasePathMapping
    Properties:
      DomainName: 'domain-name'
      RestApiId:
        Ref: ApiGatewayRestApi
      Stage: ${opt:stage}
```

If you wanted to create a similar Base Path Mapping for the duplicate ApiGateway:

```
SecondApiGatewayBasePathMapping:
    Type: AWS::ApiGateway::BasePathMapping
    Properties:
      DomainName: 'domain-name'
      RestApiId:
        Ref: ApiGatewayRestApiDuplicate
      Stage: ${opt:stage}
```

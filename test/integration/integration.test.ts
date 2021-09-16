import { execSync } from 'child_process';

describe('Given I call serverless package with the duplicate api plugin', () => {
  beforeAll(async () => {
    const output = execSync('./testSetup.sh', {
      cwd: './test/integration'
    }).toString();
    // eslint-disable-next-line
    console.log(output);
  });
  afterAll(async () => {
    const output = execSync('./testCleanup.sh', {
      cwd: './test/integration'
    }).toString();
    // eslint-disable-next-line
    console.log(output);
  });
  test('Then the cloudformation template should match the snapshot', () => {
    const keys = ['S3Key', 'CodeSha256'];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const oldTemplate = require('./cloudformation-template-update-stack-snapshot.json');
    removeKeys(oldTemplate, keys);
    const oldString = removeRandomIds(oldTemplate);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const newTemplate = require('./.serverless/cloudformation-template-update-stack.json');
    removeKeys(newTemplate, keys);
    const newString = removeRandomIds(newTemplate);

    expect(oldString).toEqual(newString);
  });
});

function removeKeys(obj, keys: string[]) {
  // eslint-disable-next-line prefer-const
  for (let [key, value] of Object.entries(obj)) {
    if (keys.includes(key)) {
      delete obj[key];
    } else if (typeof value === 'object') {
      value = removeKeys(value, keys);
    }
  }
  return obj;
}

function removeRandomIds(template) {
  let newTemplate = JSON.stringify(template);
  newTemplate = newTemplate
    .replace(RegExp('"ApiGatewayDeployment\\d+Duplicate"', 'g'), '"ApiGatewayDeploymentDuplicate"')
    .replace(RegExp(`"ApiGatewayDeployment\\d+"`, 'g'), '"ApiGatewayDeploymentDuplicate"');
  return newTemplate;
}

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { Construct } from 'constructs';

import * as path from 'path';
import { env } from 'process';

export class InadynRoute53Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const hostedZoneDomain = new cdk.CfnParameter(this, 'hostedZoneDomain', {
      type: 'String',
      description: 'Hosted zone domain name',
    });

    const existingHostedZoneId: string | undefined = this.node.tryGetContext("existingHostedZoneId");
    const hostedZone = existingHostedZoneId
      ? route53.HostedZone.fromHostedZoneId(this, 'InadynHostedZone', existingHostedZoneId)
      : new route53.HostedZone(this, 'InadynHostedZone', {
        zoneName: hostedZoneDomain.valueAsString,
      });

    // Apply a DeletionPolicy.RETAIN using the CfnResource
    if (!existingHostedZoneId) {
      (hostedZone.node.defaultChild as cdk.CfnResource)
        .applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    }

    const secret = new ssm.StringParameter(this, 'InadynLambdaPassword', {
      stringValue: env.SHA256_HASHED_PASSWD ?? "<SET ME>"
    });

    const lambdaExecutionRole = new iam.Role(this, 'InadynLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'route53:ChangeResourceRecordSets',
        'route53:GetHostedZone',
        'route53:ListResourceRecordSets',
      ],
      resources: [hostedZone.hostedZoneArn],
    }));
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameter',
      ],
      resources: [secret.parameterArn],
    }));

    const lambdaFunction = new lambda.Function(this, 'InadynLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler.main',
      code: lambda.Code.fromCustomCommand(
        path.join(__dirname, '../lambda/dist'),
        "npm install && npm run build".split(" "),
        {
          commandOptions: {
            cwd: path.join(__dirname, '../lambda'),
            shell: true,
          }
        }
      ),
      environment: {
        SSM_PASSWORD_PARAMETER_NAME: secret.parameterName,
        HOSTED_ZONE_ID: hostedZone.hostedZoneId,
        DOMAIN_NAME: hostedZoneDomain.valueAsString,
      },
      role: lambdaExecutionRole, // Assign the IAM role to the Lambda function
    });

    const lambdaFunctionUrl = lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'The ID of the newly created Route 53 Hosted Zone',
    });

    new cdk.CfnOutput(this, 'SecretName', {
      value: secret.parameterName,
      description: 'The name of the SSM Secret (must set password)',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionUrl', {
      value: lambdaFunctionUrl.url,
      description: 'The URL to access the Lambda Function',
    });
  }
}

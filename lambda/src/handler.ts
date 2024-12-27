import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Route53, RRType, ResourceRecordSet } from '@aws-sdk/client-route-53';
import { SSM } from '@aws-sdk/client-ssm';
import * as crypto from 'crypto';


const ssm = new SSM();
const route53 = new Route53();

export const main = async (event: APIGatewayProxyEventV2) => {

  const ssmParameterName = process.env.SSM_PASSWORD_PARAMETER_NAME;
  if (!ssmParameterName) {
    throw new Error('SSM_PASSWORD_PARAMETER_NAME environment variable is not set.');
  }

  const hostedZoneId = process.env.HOSTED_ZONE_ID;
  if (!hostedZoneId) {
    throw new Error('HOSTED_ZONE_ID environment variable is not set.');
  }
  
  try {
    const [ subdomain, password, newVal ] = [
      event.queryStringParameters?.subdomain,
      event.queryStringParameters?.password,
      event.queryStringParameters?.newVal,
    ];
    if (!subdomain || !password || !newVal) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Missing required parameters: subdomain, password, and newVal are required.',
        }),
      };
    }

    const paramResp = await ssm.getParameter({ Name: ssmParameterName });
    const storedPassword = paramResp.Parameter?.Value;
    if (!storedPassword) {
      throw new Error('Failed to retrieve the password from SSM Parameter Store.');
    }

    const computedHash = crypto.createHash('sha256').update(password).digest('hex');
    if (computedHash !== storedPassword) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Invalid password.' }),
      };
    }

    const fullDomain = `${subdomain}.${process.env.DOMAIN_NAME}`;
    const dnsRecord: ResourceRecordSet = {
      Name: fullDomain,
      Type: (event.queryStringParameters?.recordType ?? 'A') as RRType,
      TTL: Number(event.queryStringParameters?.ttl ?? 300),
      ResourceRecords: [{ Value: newVal }],

    };
    await route53
      .changeResourceRecordSets({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: 'UPSERT',
              ResourceRecordSet: dnsRecord,
            },
          ],
        },
      });
    
    const okRespBody = event.queryStringParameters?.okRespBody;
    const body = okRespBody ??JSON.stringify({ 
      message: `DNS record for ${fullDomain} upserted: ${JSON.stringify(dnsRecord)}` 
    });
    const contentType = okRespBody ? "text/plain" : "application/json";
    return {
      statusCode: 200,
      headers: {"content-type": contentType},
      body,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

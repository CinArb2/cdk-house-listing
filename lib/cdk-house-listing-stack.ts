import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path'
import { IResource, LambdaIntegration, MockIntegration, PassthroughBehavior, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';


export class CdkHouseListingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // create Dynamodb table
    const dynamoTable = new Table(this, 'house-listing-CDK', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING
      },
      tableName: 'house-listing',
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create Lambda function
    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      depsLockFilePath: join(__dirname, '/../lambdas', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'id',
        TABLE_NAME: dynamoTable.tableName,
      },
      runtime: Runtime.NODEJS_16_X,
      logRetention: RetentionDays.ONE_WEEK
    }
    // Create a Lambda function for each of the CRUD operations
    const getAllLambda = new NodejsFunction(this, 'getAllItemsFunction', {
      entry: join(__dirname, '/../lambdas/get-all.ts'),
      ...nodeJsFunctionProps,
    });

    // Grant the Lambda function read access to the DynamoDB table
    dynamoTable.grantReadWriteData(getAllLambda);

    // Integrate the Lambda functions with the API Gateway resource
    const getAllIntegration = new LambdaIntegration(getAllLambda);

    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, 'itemsApi', {
      restApiName: 'Items Service'
    });

    const listings = api.root.addResource('listings');
    listings.addMethod('GET', getAllIntegration);
  }
}

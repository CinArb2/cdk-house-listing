import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path'
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as events from 'aws-cdk-lib/aws-events'

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
    //get all listings houses
    const getAllLambda = new NodejsFunction(this, 'getAllItemsFunction', {
      entry: join(__dirname, '/../lambdas/get-all.ts'),
      ...nodeJsFunctionProps,
    });

    //refresh
    const refreshLambda = new NodejsFunction(this, 'refreshLambda', {
      entry: join(__dirname, '/../lambdas/refresh.ts'),
      ...nodeJsFunctionProps,
    });

    // interface CronOptions
    const eventRule = new events.Rule(this, 'scheduleRule', {
      // This schedule starts at 5:00am UTC every day (00:00 GMT -05:00-Bogota)
      schedule: events.Schedule.cron({ minute: '00', hour: '5' }),
    });

    eventRule.addTarget(new targets.LambdaFunction(refreshLambda))

    // Grant the getAllLambda function read access to the DynamoDB table
    dynamoTable.grantReadWriteData(getAllLambda);

    // Grant the refreshLambda function read access to the DynamoDB table
    dynamoTable.grantReadWriteData(refreshLambda);

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

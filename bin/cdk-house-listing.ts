#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkHouseListingStack } from '../lib/cdk-house-listing-stack';

const app = new cdk.App();
new CdkHouseListingStack(app, 'CdkHouseListingStack');

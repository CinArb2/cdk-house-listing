import * as AWS from 'aws-sdk';
import axios from 'axios';
import * as body from './body.json'
import _ from 'lodash'
import moment from 'moment'
import { v4 as uuidv4 } from 'uuid'

const TABLE_NAME = process.env.TABLE_NAME || '';

// Create DynamoDB document client
const db = new AWS.DynamoDB.DocumentClient();

export const handler = async (): Promise<any> => {

  const params = {
    TableName: TABLE_NAME
  };

  try {
    // Fetch data from an API
    const response = await axios.post('https://api.fincaraiz.com.co/document/api/1.0/listing/search', body);

    // Extract the data from the response
    const dataLatest = response.data;

    const filteredHousesLatest = dataLatest.hits.hits.filter((el: any) => {
      const datePublished = el._source.listing.dates.published
      const date = moment.utc(datePublished)

      // Check if the date is not six months old
      const sixMonthsAgo = moment().subtract(6, 'months');
      return date.isAfter(sixMonthsAgo);
    })

    //get db
    const responseDb = await db.scan(params).promise();
    const dataDb = responseDb.Items

    const missingHouseListings = filteredHousesLatest.filter(({ _source }: { _source: any }) => {
      const frPropertyId = _source.listing.fr_property_id;
      return !dataDb?.some((houseDb) => houseDb.fr_property_id === frPropertyId);
    })

    if (missingHouseListings.length === 0) {
      return { statusCode: 200, body: JSON.stringify("nothing to update!") }
    }

    const missingHouseListingsParam: Array<Object> | [] = missingHouseListings.map((el: any) => {
      const houseSource = el._source.listing
      return {
        PutRequest: {
          Item: {
            "id": el._id,
            "area": houseSource.area ?? '',
            "price": houseSource.price ?? '',
            "title": houseSource.title ?? '',
            "fr_property_id": houseSource.fr_property_id ?? '',
            "client": {
              "company_name": houseSource.client.company_name ?? '',
              "last_name": houseSource.client.last_name ?? '',
              "first_name": houseSource.client.first_name ?? ''
            },
            "dates": {
              "published": houseSource.dates?.published ?? '',
            },
            "property_type": houseSource?.property_type?.[0]?.name ?? '',
            "contact": {
              "emails":
              {
                "email": houseSource?.contact?.emails?.[0]?.email ?? '',
              },
              "phones":
              {
                "phone_number": houseSource?.contact?.phones?.[0]?.phone_number ?? '',
              },
            },
            "locations": {
              "neighbourhoods": houseSource?.locations?.neighbourhoods?.[0]?.name ?? '',
              "communes": houseSource?.locations?.communes?.[0]?.name ?? '',

            },
          }
        }
      }
    })

    async function chunkArray(array: Array<Object>, chunkSize: number) {
      let chunk: Array<Object> = [];
      let index = 0;
      let responseDbBatch: any = []

      while (index < array.length) {
        chunk = array.slice(index, index + chunkSize);

        const paramBatch = {
          RequestItems: {
            [TABLE_NAME]: chunk
          }
        };

        const responseDbBatchtest = await db.batchWrite(paramBatch).promise()
        responseDbBatch.push(responseDbBatchtest)
        index += chunkSize;
      }

      return responseDbBatch;
    }

    const chunkedArray = await chunkArray(missingHouseListingsParam, 25);

    return { statusCode: 200, body: JSON.stringify(chunkedArray) };
  } catch (error) {
    return { statusCode: 500, error: JSON.stringify(error) };
  }
};

import * as AWS from 'aws-sdk';
import axios from 'axios';
import * as body from './body.json'
import _ from 'lodash'
import moment from 'moment'
import { v4 as uuidv4 } from 'uuid'

const TABLE_NAME = process.env.TABLE_NAME || '';

// Create DynamoDB document client
const db = new AWS.DynamoDB.DocumentClient();

export const handler = async ( ): Promise<any> => {

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
      return !dataDb?.some((houseDb) => houseDb.getDataValue('fr_property_id') === frPropertyId);
    })

    const missingHouseListingsParam = missingHouseListings.map((el: any) => {
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
    let responseDbBatch = []
    function chunkArray(array: Array<Object>, chunkSize: number) {
      const chunks = [];
      let index = 0;

      while (index < array.length) {
        chunks.push(array.slice(index, index + chunkSize));
        index += chunkSize;
      }

      return chunks;
    }

    const chunkedArray = chunkArray(missingHouseListingsParam, 25);

    for (const chunk of chunkedArray) {
      const paramBatch = {
        RequestItems: {
          [TABLE_NAME]: chunk
        }
      };

      const responseDbBatchtest = await db.batchWrite(paramBatch).promise()
      console.log(responseDbBatchtest)
      responseDbBatch.push(responseDbBatchtest)
    }

    return { statusCode: 200, body: JSON.stringify(responseDbBatch) };
  } catch (error) {
    return { statusCode: 500, error: JSON.stringify(error) };
  }
};

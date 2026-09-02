import { Client } from '@elastic/elasticsearch';

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
});

// Alias export in case other parts of your app use elasticClient
export const elasticClient = esClient;

export const ARTWORK_INDEX = 'artworks';

export async function initElasticsearch() {
  const indexExists = await esClient.indices.exists({ index: ARTWORK_INDEX });

  if (!indexExists) {
    await esClient.indices.create({
      index: ARTWORK_INDEX,
      mappings: {
        properties: {
          title: { type: 'text' },
          description: { type: 'text' },
          artistName: { type: 'keyword' },
          price: { type: 'double' },
          available: { type: 'boolean' },
          category: { type: 'keyword' },
          suggest: { type: 'completion' },
        },
      },
    });
  }
}

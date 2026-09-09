const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

async function getEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from the environment');
  }

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Embedding text must be a non-empty string');
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    throw new Error(`Gemini embedding request failed: ${error.message}`);
  }
}

function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Embedding vectors must have equal lengths');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < vecA.length; index += 1) {
    dotProduct += vecA[index] * vecB[index];
    magnitudeA += vecA[index] ** 2;
    magnitudeB += vecB[index] ** 2;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    throw new Error('Cannot calculate cosine similarity for a zero-magnitude vector');
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

module.exports = {
  getEmbedding,
  cosineSimilarity,
};

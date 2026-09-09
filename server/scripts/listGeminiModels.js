const dotenv = require('dotenv');

dotenv.config();

async function listEmbeddingModels() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing from the environment');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`
  );
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || `Gemini model listing failed with HTTP ${response.status}`);
  }

  const embeddingModels = (body.models || [])
    .filter((model) => model.supportedGenerationMethods?.includes('embedContent'))
    .map((model) => ({
      name: model.name,
      supportedGenerationMethods: model.supportedGenerationMethods,
    }));

  console.log(JSON.stringify(embeddingModels, null, 2));
}

listEmbeddingModels().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

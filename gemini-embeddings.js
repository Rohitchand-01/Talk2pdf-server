import { GoogleGenerativeAI } from '@google/generative-ai';
class GoogleGenerativeAIEmbeddings {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async embed(text) {
    const model = this.genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent({ content: text });
    return result.embedding.values;
  }
}

export {GoogleGenerativeAIEmbeddings};

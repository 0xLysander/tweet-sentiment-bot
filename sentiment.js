const Sentiment = require('sentiment');

class SentimentAnalyzer {
  constructor() {
    this.sentiment = new Sentiment();
  }

  analyze(text) {
    const result = this.sentiment.analyze(text);
    
    let label;
    if (result.score > 0) {
      label = 'positive';
    } else if (result.score < 0) {
      label = 'negative';
    } else {
      label = 'neutral';
    }

    return {
      score: result.score,
      comparative: result.comparative,
      label: label,
      tokens: result.tokens,
      positive: result.positive,
      negative: result.negative
    };
  }

  getSentimentEmoji(label) {
    switch (label) {
      case 'positive':
        return '😊';
      case 'negative':
        return '😔';
      default:
        return '😐';
    }
  }
}

module.exports = SentimentAnalyzer;
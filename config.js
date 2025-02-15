module.exports = {
  // Twitter stream rules configuration
  streamRules: [
    {
      value: 'sentiment analysis OR #sentiment OR mood OR feeling',
      tag: 'sentiment-related'
    },
    {
      value: 'happy OR sad OR angry OR excited OR depressed',
      tag: 'emotions'
    }
  ],

  // Reply templates
  replyTemplates: {
    positive: [
      '😊 This tweet has a positive sentiment! (Score: {score})',
      '✨ Great vibes in this tweet! Sentiment score: {score}',
      '🌟 Positive energy detected! Score: {score}'
    ],
    negative: [
      '😔 This tweet has a negative sentiment. (Score: {score})',
      '💙 Sending good vibes your way. Sentiment score: {score}',
      '🤗 Hope things get better! Score: {score}'
    ],
    neutral: [
      '😐 This tweet has a neutral sentiment. (Score: {score})',
      '⚖️ Balanced sentiment detected. Score: {score}',
      '📊 Neutral sentiment analysis: {score}'
    ]
  },

  // Bot behavior settings
  behavior: {
    replyProbability: 0.8, // Reply to 80% of analyzed tweets
    minSentimentThreshold: 0.5, // Only reply if absolute sentiment score > 0.5
    maxRepliesPerHour: 30
  },

  // Logging settings
  logging: {
    level: 'info',
    retentionDays: 7
  }
};
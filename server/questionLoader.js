const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

class QuestionLoader {
  static async loadFromCSV(filePath) {
    return new Promise((resolve, reject) => {
      const questions = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const question = {
            category: row.Category || row.category,
            value: parseInt(row.Points || row.points || row.Value || row.value),
            question: row.Question || row.question,
            answer: row.Answer || row.answer,
            isDaily: (row.IsDaily || row.isDaily || 'false').toLowerCase() === 'true'
          };

          if (question.category && !isNaN(question.value) && question.question && question.answer) {
            questions.push(question);
          }
        })
        .on('end', () => {
          fs.unlinkSync(filePath);

          const categorizedQuestions = this.validateAndOrganize(questions);
          resolve(categorizedQuestions);
        })
        .on('error', (error) => {
          fs.unlinkSync(filePath);
          reject(error);
        });
    });
  }

  static validateAndOrganize(questions) {
    const categoryMap = new Map();

    questions.forEach(q => {
      if (!categoryMap.has(q.category)) {
        categoryMap.set(q.category, []);
      }
      categoryMap.get(q.category).push(q);
    });

    const standardValues = [200, 400, 600, 800, 1000];
    const organizedQuestions = [];

    categoryMap.forEach((catQuestions, category) => {
      standardValues.forEach(value => {
        const existingQuestion = catQuestions.find(q => q.value === value);

        if (existingQuestion) {
          organizedQuestions.push(existingQuestion);
        } else {
          organizedQuestions.push({
            category,
            value,
            question: `Placeholder question for ${category} - $${value}`,
            answer: 'Placeholder answer',
            isDaily: false
          });
        }
      });
    });

    return organizedQuestions;
  }

  static loadDefaultQuestions() {
    return [
      { category: 'Science', value: 200, question: 'This planet is known as the Red Planet', answer: 'What is Mars?', isDaily: false },
      { category: 'Science', value: 400, question: 'The chemical symbol for gold', answer: 'What is Au?', isDaily: false },
      { category: 'Science', value: 600, question: 'The number of bones in an adult human body', answer: 'What is 206?', isDaily: false },
      { category: 'Science', value: 800, question: 'The scientist who developed the theory of evolution', answer: 'Who is Charles Darwin?', isDaily: false },
      { category: 'Science', value: 1000, question: 'The speed of light in a vacuum in meters per second', answer: 'What is 299,792,458 m/s?', isDaily: false },

      { category: 'History', value: 200, question: 'The year Christopher Columbus arrived in the Americas', answer: 'What is 1492?', isDaily: false },
      { category: 'History', value: 400, question: 'The first President of the United States', answer: 'Who is George Washington?', isDaily: false },
      { category: 'History', value: 600, question: 'The ancient wonder of the world still standing today', answer: 'What are the Great Pyramids of Giza?', isDaily: false },
      { category: 'History', value: 800, question: 'The year World War II ended', answer: 'What is 1945?', isDaily: false },
      { category: 'History', value: 1000, question: 'The empire that built Machu Picchu', answer: 'What is the Inca Empire?', isDaily: false },

      { category: 'Geography', value: 200, question: 'The capital of France', answer: 'What is Paris?', isDaily: false },
      { category: 'Geography', value: 400, question: 'The longest river in the world', answer: 'What is the Nile?', isDaily: false },
      { category: 'Geography', value: 600, question: 'The number of continents on Earth', answer: 'What is 7?', isDaily: false },
      { category: 'Geography', value: 800, question: 'The smallest country in the world', answer: 'What is Vatican City?', isDaily: false },
      { category: 'Geography', value: 1000, question: 'The deepest point in the ocean', answer: 'What is the Mariana Trench?', isDaily: false },

      { category: 'Technology', value: 200, question: 'The acronym CPU stands for this', answer: 'What is Central Processing Unit?', isDaily: false },
      { category: 'Technology', value: 400, question: 'The company that created the iPhone', answer: 'What is Apple?', isDaily: false },
      { category: 'Technology', value: 600, question: 'The programming language created by Guido van Rossum', answer: 'What is Python?', isDaily: false },
      { category: 'Technology', value: 800, question: 'The year Facebook was founded', answer: 'What is 2004?', isDaily: false },
      { category: 'Technology', value: 1000, question: 'The inventor of the World Wide Web', answer: 'Who is Tim Berners-Lee?', isDaily: false },

      { category: 'Literature', value: 200, question: 'The author of "Romeo and Juliet"', answer: 'Who is William Shakespeare?', isDaily: false },
      { category: 'Literature', value: 400, question: 'The boy wizard created by J.K. Rowling', answer: 'Who is Harry Potter?', isDaily: false },
      { category: 'Literature', value: 600, question: 'The author of "1984"', answer: 'Who is George Orwell?', isDaily: false },
      { category: 'Literature', value: 800, question: 'The epic poem about the fall of Troy', answer: 'What is The Iliad?', isDaily: false },
      { category: 'Literature', value: 1000, question: 'The Russian author of "War and Peace"', answer: 'Who is Leo Tolstoy?', isDaily: false },

      { category: 'Pop Culture', value: 200, question: 'The highest-grossing film of all time (not adjusted for inflation)', answer: 'What is Avatar (2009)?', isDaily: false },
      { category: 'Pop Culture', value: 400, question: 'The streaming service that produced "Stranger Things"', answer: 'What is Netflix?', isDaily: false },
      { category: 'Pop Culture', value: 600, question: 'The artist known as "The King of Pop"', answer: 'Who is Michael Jackson?', isDaily: false },
      { category: 'Pop Culture', value: 800, question: 'The year the first Star Wars movie was released', answer: 'What is 1977?', isDaily: false },
      { category: 'Pop Culture', value: 1000, question: 'The host of Jeopardy! from 1984 to 2020', answer: 'Who is Alex Trebek?', isDaily: false }
    ];
  }
}

module.exports = QuestionLoader;
export type Quiz = {
	label: string;
	func: string;
	message: string;
};

export type QuizGroup = {
	label: string;
	quizzes: Quiz[];
};

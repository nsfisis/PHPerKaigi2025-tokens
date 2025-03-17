import type { QuizGroup } from "../quiz";
import QuizSection from "./QuizSection";

type Props = {
	quizGroup: QuizGroup;
};

function QuizGroupSection({ quizGroup }: Props) {
	return (
		<section>
			<h2>{quizGroup.label}</h2>
			{quizGroup.quizzes.map((quiz) => (
				<QuizSection key={quiz.label} quiz={quiz} />
			))}
		</section>
	);
}

export default QuizGroupSection;

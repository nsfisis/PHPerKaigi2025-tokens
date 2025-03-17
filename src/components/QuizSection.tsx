import type { Quiz } from "../quiz";
import FuncExpectedAnswer from "./FuncExpectedAnswer";
import FuncMyAnswer from "./FuncMyAnswer";

type Props = {
	quiz: Quiz;
};

function QuizSection({ quiz }: Props) {
	return (
		<section>
			<h3>{quiz.label}</h3>
			<FuncExpectedAnswer quiz={quiz} />
			<FuncMyAnswer quiz={quiz} />
		</section>
	);
}

export default QuizSection;

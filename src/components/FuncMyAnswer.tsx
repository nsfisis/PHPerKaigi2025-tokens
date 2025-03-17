import type { Quiz } from "../quiz";
import React, { useState } from "react";
import { useDebounce } from "use-debounce";

type Props = {
	quiz: Quiz;
};

const INITIAL_ANSWER = "your_answer";

function FuncMyAnswer({ quiz }: Props) {
	const [answer, setAnswer] = useState<string>(INITIAL_ANSWER);
	const [debouncedAnswer] = useDebounce(answer, 500);
	const hasAnyAnswer = debouncedAnswer !== INITIAL_ANSWER;
	const isCorrectAnswer = debouncedAnswer === quiz.func;

	const handleAnswerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setAnswer(e.target.value);
	};

	return (
		<div>
			この関数は？
			<input type="text" value={answer} onChange={handleAnswerChange} />
			<p>
				{hasAnyAnswer && (isCorrectAnswer ? `正解！${quiz.message}` : "不正解")}
			</p>
		</div>
	);
}

export default FuncMyAnswer;

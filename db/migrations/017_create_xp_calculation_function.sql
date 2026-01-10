-- Create shared XP calculation function
-- Standard Formula:
-- 2 XP per minute of actual speaking time
-- + 10 XP bonus for each full 5-minute session
-- + 15 XP per quiz
-- + 50 XP per exam passed
-- + 5 XP per streak day

CREATE OR REPLACE FUNCTION calculate_user_xp(
    speaking_seconds INTEGER,
    full_sessions INTEGER,
    quizzes INTEGER,
    exams INTEGER,
    streak INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN (
        FLOOR(speaking_seconds / 60) * 2 +
        full_sessions * 10 +
        quizzes * 15 +
        exams * 50 +
        streak * 5
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Clean up duplicate reflections, keeping only the most recent one
DELETE FROM objective_reflections
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY user_id, level, year, COALESCE(month, 0)
            ORDER BY updated_at DESC
        ) as rn
        FROM objective_reflections
    ) WHERE rn = 1
);

CREATE UNIQUE INDEX `objective_reflections_unique` ON `objective_reflections` (`user_id`,`level`,`year`,`month`);
package com.fcdzy.site.repository;

import com.fcdzy.site.entity.Topic;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TopicRepository extends JpaRepository<Topic, Long> {

    List<Topic> findAllByOrderBySortOrderAscIdAsc();

    Optional<Topic> findBySlug(String slug);

    boolean existsByName(String name);

    boolean existsBySlug(String slug);
}

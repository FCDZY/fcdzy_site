package com.fcdzy.site.repository;

import com.fcdzy.site.entity.Tag;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagRepository extends JpaRepository<Tag, Long> {

    List<Tag> findAllByOrderByNameAsc();

    Optional<Tag> findBySlug(String slug);

    boolean existsByName(String name);

    boolean existsBySlug(String slug);

    List<Tag> findAllByIdIn(List<Long> ids);
}

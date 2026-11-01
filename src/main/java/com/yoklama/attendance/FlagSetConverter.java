package com.yoklama.attendance;

import com.yoklama.decision.Flag;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.*;
import java.util.stream.Collectors;

@Converter(autoApply = false)
public class FlagSetConverter implements AttributeConverter<Set<Flag>, String> {

    @Override
    public String convertToDatabaseColumn(Set<Flag> flags) {
        if (flags == null || flags.isEmpty()) return "";
        return flags.stream()
                .sorted()
                .map(Enum::name)
                .collect(Collectors.joining(","));
    }

    @Override
    public Set<Flag> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) return EnumSet.noneOf(Flag.class);
        return Arrays.stream(dbData.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Flag::valueOf)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(Flag.class)));
    }
}
